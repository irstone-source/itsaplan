import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afkBucketFor, isWebBucket, isWindowBucket } from './aw';
import type { Capturer } from './capture';
import { parseIdentifier, type IssueRef, type PlanClient } from './client';
import type { Config } from './config';
import { startReview, type Decision, type Outcome } from './review';
import {
  addToOutbox,
  deleteSession,
  isPaused,
  listShots,
  openSession,
  readOutbox,
  removeFromOutbox,
  saveSession,
  shotsDir,
  type Attach,
  type Session,
} from './store';
import type { AwReader } from './sync';
import {
  applyPrivate,
  attachDomains,
  blockOf,
  clipToIntervals,
  domainOf,
  dropShort,
  isBrowser,
  isPrivate,
  mergePieces,
  notAfkIntervals,
  piecesOf,
  splitLong,
  type AwEvent,
  type Block,
} from './transform';

export const SHOT_INTERVAL_MS = 5 * 60_000;
// How far back the front window is looked for.
const FRONT_LOOKBACK_MS = 2 * 60_000;
const AFK_LOOKBACK_MS = 10 * 60_000;
// A not-afk state that ended longer ago than this says nothing about now.
const AFK_STALE_MS = 3 * 60_000;

type Log = (message: string) => void;

interface Interval {
  start: number;
  end: number;
}

function latest(events: AwEvent[]): AwEvent | null {
  return events.reduce<AwEvent | null>(
    (best, e) => (!best || Date.parse(e.timestamp) > Date.parse(best.timestamp) ? e : best),
    null,
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// When ActivityWatch cannot say what is in front, no screenshot is taken.
export async function frontStatus(
  aw: AwReader,
  config: Config,
  now: Date,
): Promise<'ok' | 'afk' | 'private' | 'unknown'> {
  if (!(await aw.ok())) return 'unknown';
  const buckets = await aw.buckets();
  const windowBucket = buckets.find((b) => isWindowBucket(b.id));
  if (!windowBucket) return 'unknown';
  const afk = afkBucketFor(windowBucket.id, buckets);
  if (!afk) return 'unknown';
  const state = latest(await aw.events(afk.id, new Date(now.getTime() - AFK_LOOKBACK_MS), now));
  if (!state) return 'unknown';
  if (state.data.status !== 'not-afk') return 'afk';
  if (now.getTime() - (Date.parse(state.timestamp) + state.duration * 1000) > AFK_STALE_MS) {
    return 'unknown';
  }
  const since = new Date(now.getTime() - FRONT_LOOKBACK_MS);
  const front = latest(await aw.events(windowBucket.id, since, now));
  if (!front) return 'unknown';
  const app = text(front.data.app);
  let domain: string | null = null;
  if (isBrowser(app)) {
    const web = await Promise.all(
      buckets.filter((b) => isWebBucket(b.id)).map((b) => aw.events(b.id, since, now)),
    );
    const tab = latest(web.flat());
    domain = tab ? domainOf(text(tab.data.url)) : null;
  }
  return isPrivate({ app, title: text(front.data.title), domain }, config.private)
    ? 'private'
    : 'ok';
}

function shotName(at: Date): string {
  return `shot-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}.png`;
}

function shotTime(name: string): number {
  const m = /^shot-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.png$/.exec(name);
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : NaN;
}

export type ShotResult =
  'taken' | 'no-session' | 'paused' | 'recent' | 'afk' | 'private' | 'unknown' | 'unavailable';

export interface ShotDeps {
  aw: AwReader;
  capture: Capturer;
  now: () => Date;
  log: Log;
  // `start` and `watch` may both run; a shot newer than this means the other one took it.
  minGapMs: number;
}

// Returns one tick of the screenshot loop. A capture failure turns screenshots off for the
// rest of the run, with one warning.
export function screenshotter(deps: ShotDeps): (config: Config) => Promise<ShotResult> {
  let disabled = false;
  return async (config) => {
    const session = await openSession();
    if (!session) return 'no-session';
    if (isPaused(session)) return 'paused';
    if (disabled) return 'unavailable';
    const now = deps.now();
    const shots = await listShots(session.id);
    const last = shots.length ? shotTime(shots[shots.length - 1].name) : NaN;
    if (now.getTime() - last < deps.minGapMs) return 'recent';
    const status = await frontStatus(deps.aw, config, now);
    if (status !== 'ok') return status;
    const file = join(shotsDir(session.id), shotName(now));
    try {
      await deps.capture(file);
    } catch (err) {
      disabled = true;
      await rm(file, { force: true });
      deps.log(
        `screenshots are off for this run: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'unavailable';
    }
    return 'taken';
  };
}

export interface SessionDeps {
  client: PlanClient;
  aw: AwReader;
  now: () => Date;
  confirm: (question: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  log: Log;
  reviewTimeoutMs?: number;
}

export async function startSession(
  deps: SessionDeps,
  identifier: string,
  agent: string | null,
): Promise<Session> {
  const open = await openSession();
  if (open) {
    throw new Error(
      `a session for ${open.identifier} is already open — finish or discard it first`,
    );
  }
  const issue = await deps.client.issue(identifier);
  // The identifier names the session folder, so only the strict KEY-number form is used.
  const { key, number } = parseIdentifier(issue.identifier);
  issue.identifier = `${key}-${number}`;
  const columns = await deps.client.columns(key);
  const current = columns.find((c) => c.id === issue.columnId);
  const started = columns.find((c) => c.stateType === 'started');
  if (
    started &&
    current?.stateType !== 'started' &&
    (await deps.confirm(`Move ${issue.identifier} to "${started.name}"? (y/N)`))
  ) {
    await deps.client.moveIssue(issue, started);
  }
  const now = deps.now();
  const session: Session = {
    id: `${issue.identifier}-${now.getTime()}`,
    identifier: issue.identifier,
    issueId: issue.id,
    projectId: issue.projectId,
    title: issue.title,
    agent,
    startedAt: now.toISOString(),
    pauses: [],
  };
  await saveSession(session);
  deps.log(`session started for ${issue.identifier} ${issue.title}`);
  return session;
}

// The session's time with its pauses taken out.
function activeWindow(session: Session, end: Date): Interval[] {
  const out: Interval[] = [];
  let from = Date.parse(session.startedAt);
  for (const pause of session.pauses) {
    const at = Date.parse(pause.from);
    if (at > from) out.push({ start: from, end: Math.min(at, end.getTime()) });
    from = pause.to ? Date.parse(pause.to) : Infinity;
  }
  if (from < end.getTime()) out.push({ start: from, end: end.getTime() });
  return out;
}

function intersectLength(a: Interval[], b: Interval[]): number {
  let total = 0;
  for (const x of a) {
    for (const y of b) total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  }
  return total;
}

export interface Docket {
  session: Session;
  endedAt: string;
  blocks: Block[];
  activeMs: number;
  idleMs: number;
}

// The same steps as buildBlocks, with the events also cut to the session window.
export async function buildDocket(
  aw: AwReader,
  config: Config,
  session: Session,
  end: Date,
): Promise<Docket> {
  const window = activeWindow(session, end);
  const total = window.reduce((sum, i) => sum + i.end - i.start, 0);
  const start = new Date(session.startedAt);
  const blocks: Block[] = [];
  let activeMs = total;
  if (await aw.ok()) {
    const buckets = await aw.buckets();
    const webIds = buckets.filter((b) => isWebBucket(b.id)).map((b) => b.id);
    const web = (await Promise.all(webIds.map((id) => aw.events(id, start, end)))).flat();
    for (const bucket of buckets.filter((b) => isWindowBucket(b.id))) {
      const afk = afkBucketFor(bucket.id, buckets);
      let pieces = clipToIntervals(piecesOf(await aw.events(bucket.id, start, end)), window);
      if (afk) {
        const notAfk = notAfkIntervals(await aw.events(afk.id, start, end));
        pieces = clipToIntervals(pieces, notAfk);
        activeMs = intersectLength(notAfk, window);
      }
      pieces = dropShort(splitLong(mergePieces(attachDomains(pieces, web))));
      blocks.push(...applyPrivate(pieces, config.private).map((p) => blockOf(config.device, p)));
    }
  }
  return {
    session,
    endedAt: end.toISOString(),
    blocks,
    activeMs,
    idleMs: Math.max(0, total - activeMs),
  };
}

function utc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// Window titles, app and site names, the ticket title, the agent name and the user name
// are not text the person wrote: in the comment they must not mention anyone (the zero-width
// space after '@', as in apps/api/src/modules/dockets/draft.ts) or render as markdown or
// HTML, which could load a remote image. ':' and 'www.' are escaped so no autolink forms.
export function inert(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_[\]()!<>|#~:]/g, '\\$&')
    .replace(/www\./gi, (m) => `${m.slice(0, 3)}\\.`)
    .replace(/@/g, '@\u200b');
}

function blockMs(b: Block): number {
  return Date.parse(b.endedAt) - Date.parse(b.startedAt);
}

// The docket covers the session's active time, sent or rejected, so outbox blocks keep only
// their parts outside it; otherwise approving both would count that time twice. A cut part
// is keyed by its own start, as any block is.
// Safe to run again: the parts it keeps lie outside the window, and they are stored before
// the originals are removed, a part that kept its block's start replacing it in place.
async function trimOutbox(device: string, window: Interval[]): Promise<void> {
  const overlapping: Block[] = [];
  const pieces: Block[] = [];
  for (const block of await readOutbox()) {
    const span = { start: Date.parse(block.startedAt), end: Date.parse(block.endedAt) };
    if (intersectLength([span], window) === 0) continue;
    overlapping.push(block);
    let parts = [span];
    for (const cut of window) {
      parts = parts.flatMap((p) =>
        [
          { start: p.start, end: Math.min(p.end, cut.start) },
          { start: Math.max(p.start, cut.end), end: p.end },
        ].filter((q) => q.end > q.start),
      );
    }
    const piece = { app: block.app, title: block.title, domain: block.domain };
    for (const part of dropShort(parts.map((q) => ({ ...piece, ...q })))) {
      pieces.push(blockOf(device, part, block.source, block.detail));
    }
  }
  await addToOutbox(pieces);
  await removeFromOutbox(overlapping);
}

export interface DocketText {
  who: string;
  device: string;
  blocks: Block[];
  outcome: Outcome;
  evidence: string;
  shots: Array<{ name: string; url: string }>;
}

export function docketMarkdown(docket: Docket, t: DocketText): string {
  const s = docket.session;
  const lines = [
    `## Evidence docket: ${s.identifier}${t.outcome === 'blocked' ? ' (blocked)' : ''}`,
    '',
    `- Who: ${inert(t.who)} (device ${inert(t.device)})`,
    ...(s.agent ? [`- Agent: ${inert(s.agent)}`] : []),
    `- Session: ${utc(s.startedAt)} – ${utc(docket.endedAt)}`,
    `- Active: ${duration(docket.activeMs)} (idle ${duration(docket.idleMs)})`,
    '',
    '### Timeline',
    '',
  ];
  if (t.blocks.length) {
    lines.push(
      '| Start | End | Length | App | Site | Window |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const b of t.blocks) {
      lines.push(
        `| ${b.startedAt.slice(11, 16)} | ${b.endedAt.slice(11, 16)} | ${duration(blockMs(b))} | ` +
          `${inert(b.app)} | ${inert(b.domain ?? '')} | ${inert(b.title)} |`,
      );
    }
  } else {
    lines.push('No activity blocks.');
  }
  const totals = new Map<string, number>();
  for (const b of t.blocks)
    totals.set(b.domain ?? b.app, (totals.get(b.domain ?? b.app) ?? 0) + blockMs(b));
  lines.push('', '### Apps and sites', '');
  if (totals.size) {
    lines.push('| App or site | Time |', '| --- | --- |');
    for (const [name, ms] of [...totals].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${inert(name)} | ${duration(ms)} |`);
    }
  } else {
    lines.push('None.');
  }
  if (t.evidence.trim()) {
    const heading = t.outcome === 'blocked' ? 'Blocker' : 'Evidence this is complete';
    lines.push('', `### ${heading}`, '', t.evidence.trim());
  }
  if (t.shots.length) {
    lines.push('', '### Screenshots', '');
    for (const shot of t.shots) lines.push(`![${inert(shot.name)}](${shot.url})`);
  }
  return `${lines.join('\n')}\n`;
}

export interface FinishResult {
  decision: Decision | null;
  sentShots: string[];
  sentBlocks: number;
}

const ATTACHMENT_URL = /^\/attachments\/[0-9a-f-]{36}\/raw$/i;

// The form the web editor embeds an uploaded image by (attachmentMarkdown in
// apps/web/src/components/common/editor/attachmentEmbed.ts): the web origin's media route.
function embedUrl(url: string): string {
  if (!ATTACHMENT_URL.test(url)) throw new Error(`unexpected attachment URL from Plan: ${url}`);
  return `/media${url}`;
}

async function approve(
  deps: SessionDeps,
  config: Config,
  session: Session,
): Promise<{ decision: Decision; attach: Attach | null }> {
  const end = deps.now();
  const docket = await buildDocket(deps.aw, config, session, end);
  const shots = await listShots(session.id);
  const who = (await deps.client.me())?.name ?? config.device;
  const sample = embedUrl('/attachments/00000000-0000-0000-0000-000000000000/raw');
  const baseBytes = Buffer.byteLength(
    docketMarkdown(docket, {
      who,
      device: config.device,
      blocks: docket.blocks,
      outcome: 'complete',
      evidence: '',
      shots: shots.map((s) => ({ name: s.name, url: sample })),
    }),
  );
  const review = await startReview({
    heading: `Evidence docket for ${session.identifier} ${session.title}`,
    blocks: docket.blocks,
    shots,
    docket: {
      identifier: session.identifier,
      filename: docketFilename(session, end.toISOString()),
      baseBytes,
    },
    timeoutMs: deps.reviewTimeoutMs,
  });
  deps.log(`review the docket in your browser: ${review.url}`);
  deps.openUrl(review.url);
  const decision = await review.decision;
  if (!decision.approved) return { decision, attach: null };
  const keys = new Set(decision.blocks);
  const ticked = new Set(decision.shots);
  const attach: Attach = {
    endedAt: docket.endedAt,
    who,
    outcome: decision.outcome,
    evidence: decision.evidence,
    activeMs: docket.activeMs,
    idleMs: docket.idleMs,
    blocks: docket.blocks.filter((b) => keys.has(b.sourceKey)),
    shots: shots.filter((s) => ticked.has(s.name)).map((s) => s.name),
    uploaded: {},
    docketFile: false,
    commented: false,
    blocksSent: false,
    outboxTrimmed: false,
  };
  session.attach = attach;
  await saveSession(session);
  for (const shot of shots) if (!ticked.has(shot.name)) await rm(shot.path, { force: true });
  return { decision, attach };
}

function docketFilename(session: Session, endedAt: string): string {
  return `docket-${session.identifier}-${endedAt.slice(0, 10)}.md`;
}

export async function finishSession(
  deps: SessionDeps,
  config: Config,
  identifier: string,
  options: { keep: boolean },
): Promise<FinishResult> {
  const session = await openSession();
  if (!session || session.identifier.toUpperCase() !== identifier.trim().toUpperCase()) {
    throw new Error(`no open session for ${identifier} — run: plan-time status`);
  }
  let decision: Decision | null = null;
  let attach = session.attach ?? null;
  if (attach) {
    deps.log('resuming the attach you approved earlier; steps already done are skipped');
  } else {
    ({ decision, attach } = await approve(deps, config, session));
    if (!attach) {
      deps.log(
        `nothing sent (${decision.approved ? '' : decision.reason}); the session is still open`,
      );
      return { decision, sentShots: [], sentBlocks: 0 };
    }
  }

  const issue: IssueRef = { id: session.issueId, identifier: session.identifier };
  const step = async (done: () => void) => {
    done();
    await saveSession(session);
  };
  for (const name of attach.shots) {
    if (attach.uploaded[name]) continue;
    const bytes = await readFile(join(shotsDir(session.id), name));
    const uploaded = await deps.client.uploadAttachment(issue, name, 'image/png', bytes);
    await step(() => {
      attach.uploaded[name] = { id: uploaded.id, url: embedUrl(uploaded.url) };
    });
    deps.log(`attached ${name}`);
  }
  const docket: Docket = {
    session,
    endedAt: attach.endedAt,
    blocks: attach.blocks,
    activeMs: attach.activeMs,
    idleMs: attach.idleMs,
  };
  const markdown = docketMarkdown(docket, {
    who: attach.who,
    device: config.device,
    blocks: attach.blocks,
    outcome: attach.outcome,
    evidence: attach.evidence,
    shots: attach.shots.map((name) => ({ name, url: attach.uploaded[name].url })),
  });
  const filename = docketFilename(session, attach.endedAt);
  if (!attach.docketFile) {
    await deps.client.uploadAttachment(issue, filename, 'text/markdown', Buffer.from(markdown));
    await step(() => (attach.docketFile = true));
    deps.log(`attached ${filename}`);
  }
  if (!attach.commented) {
    await deps.client.comment(issue, markdown);
    await step(() => (attach.commented = true));
    deps.log('posted the docket as a comment');
  }
  if (!attach.blocksSent) {
    if (attach.blocks.length) {
      await deps.client.uploadBlocks(
        config.device,
        attach.blocks.map((b) => ({ ...b, issueId: session.issueId })),
      );
      deps.log(`sent ${attach.blocks.length} time blocks against ${session.identifier}`);
    }
    await step(() => (attach.blocksSent = true));
  }
  if (!attach.outboxTrimmed) {
    await trimOutbox(config.device, activeWindow(session, new Date(attach.endedAt)));
    await step(() => (attach.outboxTrimmed = true));
  }

  if (attach.outcome === 'blocked') {
    deps.log(`${session.identifier} stays open: the docket records the blocker`);
  } else if (await deps.confirm(`Complete ${session.identifier}? (y/N)`)) {
    const columns = await deps.client.columns(parseIdentifier(session.identifier).key);
    const done = columns.find((c) => c.stateType === 'completed');
    if (done) {
      await deps.client.moveIssue(issue, done);
      deps.log(`${session.identifier} moved to "${done.name}"`);
    } else {
      deps.log('this project has no completed column');
    }
  }
  if (options.keep) deps.log(`session kept in ${shotsDir(session.id)}`);
  else await deleteSession(session.id);
  return { decision, sentShots: attach.shots, sentBlocks: attach.blocks.length };
}

export async function pauseSession(paused: boolean, now: Date): Promise<Session> {
  const session = await openSession();
  if (!session) throw new Error('no open session');
  if (paused === isPaused(session)) return session;
  if (paused) session.pauses.push({ from: now.toISOString(), to: null });
  else session.pauses[session.pauses.length - 1].to = now.toISOString();
  await saveSession(session);
  return session;
}
