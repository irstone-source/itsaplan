import { ActivityWatch, afkBucketFor, isWebBucket, isWindowBucket, type AwBucket } from './aw';
import { callBlocks, readCalls, readContacts } from './calls';
import { PlanClient, platformOf, type Fetch } from './client';
import { saveConfig, type Config } from './config';
import { startReview } from './review';
import { addToOutbox, readOutbox, removeFromOutbox } from './store';
import {
  applyPrivate,
  buildBlocks,
  clipToIntervals,
  MAX_BLOCK_MS,
  MERGE_GAP_MS,
  notAfkIntervals,
  piecesOf,
  type AwEvent,
  type Block,
} from './transform';
import { VERSION } from './version';

export const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

// A block is keyed by its start minute, so re-reading events from before the cursor
// reproduces the same keys and a block that grew since the last sync is updated, not
// duplicated. A block reaches back at most one cap plus one gap from the cursor; a longer
// run of the same activity is handled by readWindow.
const REFETCH_MS = MAX_BLOCK_MS + MERGE_GAP_MS;

export type AwReader = Pick<ActivityWatch, 'ok' | 'buckets' | 'events'>;

export interface SyncOptions {
  calls: boolean;
  dryRun: boolean;
  log: (message: string) => void;
  aw?: AwReader;
  fetch?: Fetch;
  now?: Date;
}

export interface SyncResult {
  awOk: boolean;
  blocks: number;
  queued: number;
}

interface Window {
  windowEvents: AwEvent[];
  afkEvents: AwEvent[] | null;
  since: Date;
}

function firstActivity(windowEvents: AwEvent[], afkEvents: AwEvent[] | null): number | null {
  let pieces = piecesOf(windowEvents);
  if (afkEvents) pieces = clipToIntervals(pieces, notAfkIntervals(afkEvents));
  return pieces.reduce<number | null>(
    (min, p) => (min === null || p.start < min ? p.start : min),
    null,
  );
}

// The window starts one refetch before the cursor and is moved earlier until the first
// activity in it begins at least one merge gap after its start. A run of the same activity
// that straddled the start would otherwise be keyed by the wrong minute and duplicate the
// block an earlier sync sent.
async function readWindow(
  aw: AwReader,
  windowId: string,
  afkId: string | undefined,
  cursor: string | undefined,
  now: Date,
): Promise<Window> {
  const floor = now.getTime() - MAX_LOOKBACK_MS;
  let since = cursor ? Math.max(Date.parse(cursor) - REFETCH_MS, floor) : floor;
  for (;;) {
    const [windowEvents, afkEvents] = await Promise.all([
      aw.events(windowId, new Date(since), now),
      afkId ? aw.events(afkId, new Date(since), now) : Promise.resolve(null),
    ]);
    const first = firstActivity(windowEvents, afkEvents);
    if (since <= floor || first === null || first - since >= MERGE_GAP_MS) {
      return { windowEvents, afkEvents, since: new Date(since) };
    }
    since = Math.max(since - REFETCH_MS, floor);
  }
}

// Blocks that ended before the cursor were sent unchanged by an earlier sync.
function newSince(blocks: Block[], cursor: string | undefined): Block[] {
  if (!cursor) return blocks;
  const at = Date.parse(cursor);
  return blocks.filter((block) => Date.parse(block.endedAt) > at);
}

async function activityBlocks(
  config: Config,
  aw: AwReader,
  buckets: AwBucket[],
  now: Date,
  log: SyncOptions['log'],
): Promise<Map<string, Block[]>> {
  const out = new Map<string, Block[]>();
  const windows = buckets.filter((b) => isWindowBucket(b.id));
  if (windows.length === 0) log('no aw-watcher-window bucket found');
  const webIds = buckets.filter((b) => isWebBucket(b.id)).map((b) => b.id);
  for (const bucket of windows) {
    const cursor = config.cursor[bucket.id];
    const afk = afkBucketFor(bucket.id, buckets);
    const { windowEvents, afkEvents, since } = await readWindow(
      aw,
      bucket.id,
      afk?.id,
      cursor,
      now,
    );
    const web = await Promise.all(webIds.map((id) => aw.events(id, since, now)));
    const blocks = buildBlocks({
      device: config.device,
      windowEvents,
      afkEvents,
      webEvents: web.flat(),
      privateList: config.private,
    });
    out.set(bucket.id, newSince(blocks, cursor));
  }
  return out;
}

// A call reaches the Mac from iCloud some time after it ended, so the whole window is
// read every time; the server upserts by key, so a call sent twice is not duplicated.
async function phoneBlocks(config: Config, now: Date): Promise<Block[]> {
  const since = now.getTime() - MAX_LOOKBACK_MS;
  const [rows, contacts] = await Promise.all([readCalls(since), readContacts()]);
  return applyPrivate(callBlocks(config.device, rows, contacts), config.private);
}

function describe(block: Block): string {
  const minutes = Math.round((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60_000);
  return (
    `${block.startedAt.slice(0, 16)} ${String(minutes).padStart(4)}m ${block.app}` +
    `${block.domain ? ` (${block.domain})` : ''} — ${block.title}`
  );
}

// Reads activity into the outbox; nothing but the heartbeat is sent. apiKey null skips the
// heartbeat as well.
export async function sync(
  config: Config,
  apiKey: string | null,
  options: SyncOptions,
): Promise<SyncResult> {
  const { log } = options;
  const now = options.now ?? new Date();
  const aw = options.aw ?? new ActivityWatch();
  const awOk = await aw.ok();
  if (!options.dryRun && apiKey) {
    await new PlanClient(config.url, apiKey, { fetch: options.fetch }).heartbeat({
      device: config.device,
      platform: platformOf(process.platform),
      version: VERSION,
      awOk,
    });
  }

  const perSource = new Map<string, Block[]>();
  if (awOk) {
    const buckets = await aw.buckets();
    for (const [id, blocks] of await activityBlocks(config, aw, buckets, now, log)) {
      perSource.set(id, blocks);
    }
  } else {
    log('ActivityWatch is not running at http://localhost:5600 — no activity read');
  }
  if (options.calls) {
    if (process.platform !== 'darwin') log('--calls works on macOS only');
    else perSource.set('calls', await phoneBlocks(config, now));
  }

  const all = [...perSource.values()].flat();
  if (options.dryRun) {
    for (const block of all) log(describe(block));
    log(`dry run: ${all.length} blocks, nothing stored or sent`);
    return { awOk, blocks: all.length, queued: 0 };
  }

  await addToOutbox(all);
  const waiting = (await readOutbox()).length;
  log(
    all.length
      ? `${all.length} blocks held on this computer, ${waiting} waiting — run: plan-time review`
      : 'nothing new',
  );
  for (const id of perSource.keys()) config.cursor[id] = now.toISOString();
  await saveConfig(config);
  return { awOk, blocks: all.length, queued: all.length };
}

export interface ReviewOptions {
  yes: boolean;
  log: (message: string) => void;
  openUrl: (url: string) => void;
  // With --yes at a terminal, asked after the list is printed.
  confirm?: (question: string) => Promise<boolean>;
  reviewTimeoutMs?: number;
}

// Sends the outbox blocks the person approves; the rest are deleted. Blocks added or
// extended while the page is open are left for the next review.
export async function reviewOutbox(
  config: Config,
  client: PlanClient,
  options: ReviewOptions,
): Promise<number> {
  const { log } = options;
  const blocks = await readOutbox();
  if (blocks.length === 0) {
    log('nothing waiting for review');
    return 0;
  }
  let approved = blocks;
  if (options.yes) {
    for (const block of blocks) log(describe(block));
    if (options.confirm && !(await options.confirm(`Send these ${blocks.length} blocks? (y/N)`))) {
      log('nothing sent; the blocks are still waiting');
      return 0;
    }
  } else {
    const review = await startReview({
      heading: `Time blocks waiting on ${config.device}`,
      blocks,
      shots: [],
      timeoutMs: options.reviewTimeoutMs,
    });
    log(`review your time in your browser: ${review.url}`);
    options.openUrl(review.url);
    const decision = await review.decision;
    if (!decision.approved) {
      log(`nothing sent (${decision.reason}); the blocks are still waiting`);
      return 0;
    }
    const keys = new Set(decision.blocks);
    approved = blocks.filter((b) => keys.has(b.sourceKey));
  }
  if (approved.length) {
    const result = await client.uploadBlocks(config.device, approved);
    log(
      `sent ${approved.length} blocks: ${result.inserted} new, ${result.updated} updated, ` +
        `${result.skipped} skipped`,
    );
  }
  const deleted = blocks.length - approved.length;
  if (deleted) log(`deleted ${deleted} blocks from this computer`);
  await removeFromOutbox(blocks);
  return approved.length;
}
