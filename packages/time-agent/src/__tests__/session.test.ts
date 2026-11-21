import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlanClient, sentLogPath, type Fetch } from '../client';
import type { Config } from '../config';
import { startReview } from '../review';
import {
  docketMarkdown,
  finishSession,
  pauseSession,
  screenshotter,
  startSession,
  type SessionDeps,
} from '../session';
import {
  addToOutbox,
  listShots,
  openSession,
  readOutbox,
  sessionDir,
  type Session,
} from '../store';
import { reviewOutbox, sync, type AwReader } from '../sync';
import { sourceKeyOf, type AwEvent, type Block } from '../transform';

const saved = process.env.PLAN_TIME_HOME;

beforeEach(async () => {
  process.env.PLAN_TIME_HOME = await mkdtemp(join(tmpdir(), 'plan-time-session-'));
});

afterAll(() => {
  if (saved === undefined) delete process.env.PLAN_TIME_HOME;
  else process.env.PLAN_TIME_HOME = saved;
});

const DAY = '2026-11-02T';
const WINDOW = 'aw-watcher-window_mac';
const AFK = 'aw-watcher-afk_mac';
const WEB = 'aw-watcher-web-chrome';

function t(clock: string): Date {
  return new Date(`${DAY}${clock}:00.000Z`);
}

function ev(from: string, to: string, data: Record<string, unknown>): AwEvent {
  return {
    timestamp: t(from).toISOString(),
    duration: (t(to).getTime() - t(from).getTime()) / 1000,
    data,
  };
}

function fakeAw(buckets: Record<string, AwEvent[]>): AwReader {
  return {
    ok: async () => true,
    buckets: async () => Object.keys(buckets).map((id) => ({ id, type: '' })),
    events: async (id, start, end) =>
      (buckets[id] ?? []).filter((e) => {
        const s = Date.parse(e.timestamp);
        return s <= end.getTime() && s + e.duration * 1000 >= start.getTime();
      }),
  };
}

// 10:00–10:12 Code, 10:12–10:20 Chrome on github.com, 10:20–10:30 Code again.
function workday(): Record<string, AwEvent[]> {
  return {
    [WINDOW]: [
      ev('10:00', '10:12', { app: 'Code', title: 'session.ts' }),
      ev('10:12', '10:20', { app: 'Google Chrome', title: 'PR #12' }),
      ev('10:20', '10:30', { app: 'Code', title: 'review.ts' }),
    ],
    [AFK]: [ev('10:00', '10:30', { status: 'not-afk' })],
    [WEB]: [ev('10:12', '10:20', { url: 'https://github.com/x/y/pull/12' })],
  };
}

function config(): Config {
  return {
    url: 'https://plan.test',
    device: 'mac',
    cursor: {},
    private: { apps: ['1Password'], domains: [], titles: [] },
  };
}

interface Request {
  method: string;
  path: string;
  json: unknown;
  // For a multipart upload, the filename in the form.
  file: string | null;
}

const COLUMNS = [
  { id: 1, name: 'Todo', stateType: 'unstarted', position: 0 },
  { id: 2, name: 'Doing', stateType: 'started', position: 1 },
  { id: 3, name: 'Done', stateType: 'completed', position: 2 },
];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// failCommentOnce makes the first comment POST answer 400.
function fakePlan(failCommentOnce = false): { fetch: Fetch; requests: Request[] } {
  const requests: Request[] = [];
  let uploads = 0;
  let failComment = failCommentOnce;
  const fetch: Fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body;
    let json: unknown = null;
    let file: string | null = null;
    if (body instanceof Uint8Array) {
      file = /filename="([^"]+)"/.exec(Buffer.from(body).toString('latin1'))?.[1] ?? null;
    } else if (typeof body === 'string') {
      json = JSON.parse(body);
    }
    requests.push({ method, path, json, file });
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (path === '/me') return reply({ authenticated: true, user: { name: 'Ian Stone' } });
    if (path === '/projects/CON/issues/158') {
      return reply({ id: 42, identifier: 'CON-158', title: 'Build it', columnId: 1, projectId: 7 });
    }
    if (path === '/projects/CON') return reply({ columns: COLUMNS });
    if (path === '/issues/42/attachments') {
      uploads++;
      return reply(
        { id: uuid(uploads), filename: file, url: `/attachments/${uuid(uploads)}/raw` },
        201,
      );
    }
    if (path === '/issues/42/comments' && failComment) {
      failComment = false;
      return reply({ error: 'bad' }, 400);
    }
    if (path === '/time/agent/blocks') {
      const blocks = (json as { blocks: unknown[] }).blocks;
      return reply({ inserted: blocks.length, updated: 0, skipped: 0 });
    }
    return reply({}, method === 'POST' ? 201 : 200);
  };
  return { fetch, requests };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('work session', () => {
  it('sends nothing before approval, then exactly what was ticked', async () => {
    const aw = fakeAw(workday());
    const plan = fakePlan();
    const client = new PlanClient('https://plan.test', 'key', { fetch: plan.fetch });
    const cfg = config();
    let clock = t('09:59');
    const questions: string[] = [];
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const deps: SessionDeps = {
      client,
      aw,
      now: () => clock,
      confirm: async (q) => {
        questions.push(q);
        return q.startsWith('Complete');
      },
      openUrl: (url) => opened(url),
      log: () => {},
    };
    const captured: string[] = [];
    const shoot = screenshotter({
      aw,
      capture: async (file) => {
        captured.push(file);
        await writeFile(file, PNG);
      },
      now: () => clock,
      log: () => {},
      minGapMs: 150_000,
    });

    await sync(cfg, 'key', {
      calls: false,
      dryRun: false,
      log: () => {},
      aw,
      fetch: plan.fetch,
      now: t('10:30'),
    });
    expect(await readOutbox()).toHaveLength(3);
    // A watch tick: a sync, then a screenshot attempt, which has no session yet.
    expect(await shoot(cfg)).toBe('no-session');
    clock = t('10:00');
    const session = await startSession(deps, 'con-158', 'claude');
    expect(session.identifier).toBe('CON-158');
    expect(questions).toEqual(['Move CON-158 to "Doing"? (y/N)']);
    for (const at of ['10:05', '10:10', '10:15']) {
      clock = t(at);
      expect(await shoot(cfg)).toBe('taken');
    }
    expect(captured).toHaveLength(3);

    clock = t('10:30');
    const finishing = finishSession(deps, cfg, 'CON-158', { keep: false });
    const url = await reviewUrl;

    const writes = plan.requests.filter((r) => r.method !== 'GET');
    expect(writes.map((r) => r.path)).toEqual(['/time/agent/heartbeat']);
    expect(writes[0].json).toEqual({
      device: 'mac',
      platform: expect.any(String),
      version: expect.any(String),
      awOk: true,
    });

    const html = await (await fetch(url)).text();
    expect(html).toContain('Nothing has been sent from this computer');
    expect(html).toContain('Attached screenshots can be viewed by anyone who has their link.');
    const keys = [...html.matchAll(/class="block" value="([0-9a-f]+)"/g)].map((m) => m[1]);
    expect(keys).toHaveLength(3);
    const shots = (await listShots(session.id)).map((s) => s.name);
    expect(shots).toHaveLength(3);
    const token = new URL(url).searchParams.get('token')!;
    const shotRes = await fetch(new URL(`shot?name=${shots[0]}&token=${token}`, url));
    expect(Buffer.from(await shotRes.arrayBuffer())).toEqual(PNG);

    const approve = await fetch(new URL(`approve?token=${token}`, url), {
      method: 'POST',
      body: JSON.stringify({
        blocks: [keys[0], keys[2]],
        shots: [shots[0], shots[2]],
        outcome: 'complete',
        evidence: 'Wrote the docket flow.',
      }),
    });
    expect(approve.status).toBe(200);
    const result = await finishing;
    expect(result.sentShots).toEqual([shots[0], shots[2]]);

    const after = plan.requests
      .slice(plan.requests.indexOf(writes[0]) + 1)
      .filter((r) => r.method !== 'GET');
    expect(after.map((r) => [r.method, r.path, r.file])).toEqual([
      ['POST', '/issues/42/attachments', shots[0]],
      ['POST', '/issues/42/attachments', shots[2]],
      ['POST', '/issues/42/attachments', 'docket-CON-158-2026-11-02.md'],
      ['POST', '/issues/42/comments', null],
      ['POST', '/time/agent/blocks', null],
      ['PATCH', '/issues/42', null],
    ]);
    const comment = (after[3].json as { body: string }).body;
    expect(comment).toContain('## Evidence docket: CON-158\n');
    expect(comment).toContain('### Evidence this is complete');
    expect(comment).toContain('Who: Ian Stone (device mac)');
    expect(comment).toContain('Agent: claude');
    expect(comment).toContain('Wrote the docket flow.');
    expect(comment).toContain('![' + shots[0] + `](/media/attachments/${uuid(1)}/raw)`);
    expect(comment).toContain('![' + shots[2] + `](/media/attachments/${uuid(2)}/raw)`);
    expect(comment).not.toContain(shots[1]);
    const sent = (after[4].json as { blocks: Array<Block & { issueId: number }> }).blocks;
    expect(sent.map((b) => b.sourceKey)).toEqual([keys[0], keys[2]]);
    expect(sent.every((b) => b.issueId === 42)).toBe(true);
    expect(after[5].json).toEqual({ columnId: 3 });
    expect(questions[1]).toBe('Complete CON-158? (y/N)');

    expect(existsSync(sessionDir(session.id))).toBe(false);
    expect(await openSession()).toBeNull();
    // The outbox blocks inside the session were covered by the docket.
    expect(await readOutbox()).toEqual([]);

    const log = (await readFile(sentLogPath(), 'utf8')).trim().split('\n');
    expect(log).toHaveLength(plan.requests.length);
  });

  it('keeps the session and sends nothing when the review is cancelled', async () => {
    const aw = fakeAw(workday());
    const plan = fakePlan();
    let clock = t('10:00');
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: plan.fetch }),
      aw,
      now: () => clock,
      confirm: async () => true,
      openUrl: (url) => opened(url),
      log: () => {},
    };
    await startSession(deps, 'CON-158', null);
    expect(plan.requests.find((r) => r.method === 'PATCH')?.json).toEqual({ columnId: 2 });
    clock = t('10:30');
    const finishing = finishSession(deps, config(), 'CON-158', { keep: false });
    const url = await reviewUrl;
    const token = new URL(url).searchParams.get('token')!;
    await fetch(new URL(`cancel?token=${token}`, url), { method: 'POST', body: '{}' });
    expect((await finishing).decision).toEqual({ approved: false, reason: 'cancelled' });
    expect(plan.requests.filter((r) => r.method === 'POST')).toEqual([]);
    expect(await openSession()).not.toBeNull();
  });
});

describe('screenshots', () => {
  async function openOne(aw: AwReader) {
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: fakePlan().fetch }),
      aw,
      now: () => t('10:00'),
      confirm: async () => false,
      openUrl: () => {},
      log: () => {},
    };
    await startSession(deps, 'CON-158', null);
  }

  function shooter(aw: AwReader, at: string, captured: string[]) {
    return screenshotter({
      aw,
      capture: async (file) => {
        captured.push(file);
        await writeFile(file, PNG);
      },
      now: () => t(at),
      log: () => {},
      minGapMs: 150_000,
    });
  }

  it('skips the shot while the person is away', async () => {
    const aw = fakeAw({
      [WINDOW]: [ev('10:00', '10:30', { app: 'Code', title: 'x' })],
      [AFK]: [ev('10:00', '10:04', { status: 'not-afk' }), ev('10:04', '10:30', { status: 'afk' })],
    });
    await openOne(aw);
    const captured: string[] = [];
    expect(await shooter(aw, '10:10', captured)(config())).toBe('afk');
    expect(captured).toEqual([]);
  });

  it('skips the shot while a private app or site is in front', async () => {
    const aw = fakeAw({
      [WINDOW]: [
        ev('10:00', '10:05', { app: '1Password', title: 'Vault' }),
        ev('10:05', '10:10', { app: 'Safari', title: 'Bank' }),
      ],
      [AFK]: [ev('10:00', '10:30', { status: 'not-afk' })],
      [WEB]: [ev('10:05', '10:10', { url: 'https://www.monzo.com/account' })],
    });
    await openOne(aw);
    const captured: string[] = [];
    expect(await shooter(aw, '10:04', captured)(config())).toBe('private');
    const cfg = { ...config(), private: { apps: [], domains: ['monzo.com'], titles: [] } };
    expect(await shooter(aw, '10:09', captured)(cfg)).toBe('private');
    expect(captured).toEqual([]);
  });

  it('skips the shot while paused, and after another process just took one', async () => {
    const aw = fakeAw(workday());
    await openOne(aw);
    const captured: string[] = [];
    await pauseSession(true, t('10:01'));
    expect(await shooter(aw, '10:05', captured)(config())).toBe('paused');
    await pauseSession(false, t('10:06'));
    expect(await shooter(aw, '10:07', captured)(config())).toBe('taken');
    expect(await shooter(aw, '10:08', captured)(config())).toBe('recent');
    expect(captured).toHaveLength(1);
  });

  it('turns screenshots off after the capture tool fails', async () => {
    const aw = fakeAw(workday());
    await openOne(aw);
    const warnings: string[] = [];
    let clock = t('10:05');
    const shoot = screenshotter({
      aw,
      capture: async () => {
        throw new Error('no screenshot tool found');
      },
      now: () => clock,
      log: (m) => warnings.push(m),
      minGapMs: 150_000,
    });
    expect(await shoot(config())).toBe('unavailable');
    clock = t('10:10');
    expect(await shoot(config())).toBe('unavailable');
    expect(warnings).toHaveLength(1);
  });
  it('needs evidence or a blocker, and leaves a blocked ticket open', async () => {
    const aw = fakeAw(workday());
    const plan = fakePlan();
    let clock = t('10:00');
    const questions: string[] = [];
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: plan.fetch }),
      aw,
      now: () => clock,
      confirm: async (q) => {
        questions.push(q);
        return true;
      },
      openUrl: (url) => opened(url),
      log: () => {},
    };
    await startSession(deps, 'CON-158', null);
    clock = t('10:30');
    const finishing = finishSession(deps, config(), 'CON-158', { keep: false });
    const url = await reviewUrl;
    const token = new URL(url).searchParams.get('token')!;
    const approve = (body: unknown) =>
      fetch(new URL(`approve?token=${token}`, url), { method: 'POST', body: JSON.stringify(body) });

    const empty = await approve({ blocks: [], shots: [], outcome: 'complete', evidence: '  ' });
    expect(empty.status).toBe(400);
    const blocked = await approve({
      blocks: [],
      shots: [],
      outcome: 'blocked',
      evidence: 'Waiting on Chris to sign off',
    });
    expect(blocked.status).toBe(200);
    await finishing;

    const comment = plan.requests.find((r) => r.path === '/issues/42/comments')!;
    const body = (comment.json as { body: string }).body;
    expect(body).toContain('## Evidence docket: CON-158 (blocked)');
    expect(body).toContain('### Blocker\n\nWaiting on Chris to sign off');
    expect(questions.some((q) => q.startsWith('Complete'))).toBe(false);
    expect(plan.requests.filter((r) => r.method === 'PATCH').map((r) => r.json)).toEqual([
      { columnId: 2 },
    ]);
  });
});

describe('review server', () => {
  const block: Block = {
    sourceKey: 'abcdef0123',
    source: 'activity',
    startedAt: '2026-11-02T10:00:00.000Z',
    endedAt: '2026-11-02T10:10:00.000Z',
    app: 'Code',
    title: '<script>alert(1)</script>',
    domain: null,
  };

  it('listens on 127.0.0.1 and refuses a missing or wrong token', async () => {
    const review = await startReview({
      heading: 'Time',
      blocks: [block],
      shots: [],
      timeoutMs: 5000,
    });
    const url = new URL(review.url);
    expect(url.hostname).toBe('127.0.0.1');
    const base = `http://127.0.0.1:${review.port}`;
    expect((await fetch(`${base}/`)).status).toBe(403);
    expect((await fetch(`${base}/?token=wrong`)).status).toBe(403);
    expect((await fetch(`${base}/approve`, { method: 'POST', body: '{}' })).status).toBe(403);
    const page = await fetch(review.url);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Send');
    await fetch(`${base}/approve?token=${review.token}`, {
      method: 'POST',
      body: JSON.stringify({ blocks: ['abcdef0123', 'not-shown'], shots: ['x.png'] }),
    });
    expect(await review.decision).toEqual({
      approved: true,
      blocks: ['abcdef0123'],
      shots: [],
      outcome: 'complete',
      evidence: '',
    });
  });

  it('times out without a decision', async () => {
    const review = await startReview({
      heading: 'Time',
      blocks: [block],
      shots: [],
      timeoutMs: 20,
    });
    expect(await review.decision).toEqual({ approved: false, reason: 'timeout' });
  });
});

describe('outbox', () => {
  it('keeps one copy per key, the latest', async () => {
    const block: Block = {
      sourceKey: 'k1k1k1k1',
      source: 'activity',
      startedAt: '2026-11-02T10:00:00.000Z',
      endedAt: '2026-11-02T10:10:00.000Z',
      app: 'Code',
      title: 'a',
      domain: null,
    };
    await addToOutbox([block]);
    await addToOutbox([{ ...block, endedAt: '2026-11-02T10:40:00.000Z' }]);
    await addToOutbox([{ ...block, sourceKey: 'k2k2k2k2', startedAt: '2026-11-03T09:00:00.000Z' }]);
    const out = await readOutbox();
    expect(out).toHaveLength(2);
    expect(out[0].endedAt).toBe('2026-11-02T10:40:00.000Z');
  });
});

describe('review of the outbox', () => {
  function blocks(): Block[] {
    return ['k1k1k1k1', 'k2k2k2k2', 'k3k3k3k3'].map((sourceKey, i) => ({
      sourceKey,
      source: 'activity',
      startedAt: `2026-11-02T1${i}:00:00.000Z`,
      endedAt: `2026-11-02T1${i}:30:00.000Z`,
      app: 'Code',
      title: String(i),
      domain: null,
    }));
  }

  it('sends the ticked blocks and deletes the rest', async () => {
    await addToOutbox(blocks());
    const plan = fakePlan();
    const client = new PlanClient('https://plan.test', 'key', { fetch: plan.fetch });
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const reviewing = reviewOutbox(config(), client, {
      yes: false,
      log: () => {},
      openUrl: (url) => opened(url),
    });
    const url = await reviewUrl;
    expect(plan.requests).toEqual([]);
    const token = new URL(url).searchParams.get('token')!;
    await fetch(new URL(`approve?token=${token}`, url), {
      method: 'POST',
      body: JSON.stringify({ blocks: ['k2k2k2k2'] }),
    });
    expect(await reviewing).toBe(1);
    expect(plan.requests).toHaveLength(1);
    const sent = (plan.requests[0].json as { blocks: Block[] }).blocks;
    expect(sent.map((b) => b.sourceKey)).toEqual(['k2k2k2k2']);
    expect(await readOutbox()).toEqual([]);
  });

  it('with --yes lists the blocks and sends them all', async () => {
    await addToOutbox(blocks());
    const plan = fakePlan();
    const client = new PlanClient('https://plan.test', 'key', { fetch: plan.fetch });
    const printed: string[] = [];
    const sent = await reviewOutbox(config(), client, {
      yes: true,
      log: (m) => printed.push(m),
      openUrl: () => {
        throw new Error('no page with --yes');
      },
    });
    expect(sent).toBe(3);
    expect(printed.slice(0, 3).every((line) => line.includes('Code'))).toBe(true);
    expect(await readOutbox()).toEqual([]);
  });
});

describe('outbox after attach', () => {
  // Opens a session at 10:00, optionally pauses it, finishes at 11:00 and approves all.
  async function attachAll(
    aw: AwReader,
    pause?: [string, string],
  ): Promise<{ outbox: Block[]; docket: Block[] }> {
    const plan = fakePlan();
    let clock = t('10:00');
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: plan.fetch }),
      aw,
      now: () => clock,
      confirm: async () => false,
      openUrl: (url) => opened(url),
      log: () => {},
    };
    await startSession(deps, 'CON-158', null);
    if (pause) {
      await pauseSession(true, t(pause[0]));
      await pauseSession(false, t(pause[1]));
    }
    clock = t('11:00');
    const finishing = finishSession(deps, config(), 'CON-158', { keep: false });
    const url = await reviewUrl;
    const html = await (await fetch(url)).text();
    const keys = [...html.matchAll(/class="block" value="([0-9a-f]+)"/g)].map((m) => m[1]);
    const token = new URL(url).searchParams.get('token')!;
    await fetch(new URL(`approve?token=${token}`, url), {
      method: 'POST',
      body: JSON.stringify({ blocks: keys, shots: [], evidence: 'Done.' }),
    });
    await finishing;
    const sent = plan.requests.find((r) => r.path === '/time/agent/blocks');
    return { outbox: await readOutbox(), docket: (sent?.json as { blocks: Block[] }).blocks };
  }

  function times(blocks: Block[]): string[][] {
    return blocks.map((b) => [b.startedAt.slice(11, 16), b.endedAt.slice(11, 16)]);
  }

  it('keeps only the part of a straddling block before the session', async () => {
    const aw = fakeAw({
      [WINDOW]: [ev('09:50', '10:20', { app: 'Code', title: 'x' })],
      [AFK]: [ev('09:50', '11:00', { status: 'not-afk' })],
    });
    await sync(config(), null, { calls: false, dryRun: false, log: () => {}, aw, now: t('10:20') });
    expect(times(await readOutbox())).toEqual([['09:50', '10:20']]);
    const { outbox, docket } = await attachAll(aw);
    expect(times(outbox)).toEqual([['09:50', '10:00']]);
    expect(outbox[0].sourceKey).toBe(sourceKeyOf('mac', 'Code', 'x', t('09:50').getTime()));
    expect(times(docket)).toEqual([['10:00', '10:20']]);
  });

  it('keeps a paused span inside the session as its own block', async () => {
    const aw = fakeAw({
      [WINDOW]: [ev('10:15', '10:45', { app: 'Code', title: 'x' })],
      [AFK]: [ev('10:00', '11:00', { status: 'not-afk' })],
    });
    await sync(config(), null, { calls: false, dryRun: false, log: () => {}, aw, now: t('10:50') });
    const { outbox, docket } = await attachAll(aw, ['10:20', '10:40']);
    expect(times(outbox)).toEqual([['10:20', '10:40']]);
    expect(outbox[0].sourceKey).toBe(sourceKeyOf('mac', 'Code', 'x', t('10:20').getTime()));
    expect(times(docket)).toEqual([
      ['10:15', '10:20'],
      ['10:40', '10:45'],
    ]);
  });
});

describe('review fixes', () => {
  const EVIL = '@zak ![x](https://e/x.gif) <img src=x> [l](https://e) www.e.com';

  it('docket text from the machine mentions no one and carries no markup', () => {
    const session: Session = {
      id: 's',
      identifier: 'CON-158',
      issueId: 42,
      projectId: 7,
      title: EVIL,
      agent: '@bot',
      startedAt: t('10:00').toISOString(),
      pauses: [],
    };
    const block: Block = {
      sourceKey: 'k1k1k1k1',
      source: 'activity',
      startedAt: t('10:00').toISOString(),
      endedAt: t('10:10').toISOString(),
      app: '@app<b>',
      title: EVIL,
      domain: 'e.com',
    };
    const md = docketMarkdown(
      { session, endedAt: t('10:30').toISOString(), blocks: [block], activeMs: 0, idleMs: 0 },
      {
        who: '@who',
        device: 'mac',
        blocks: [block],
        outcome: 'complete',
        evidence: 'Thanks @ian',
        shots: [],
      },
    );
    expect(md.replace('Thanks @ian', '')).not.toMatch(/@(?!\u200b)/);
    // What is left once every backslash-escaped character is removed is what renders as
    // markup: no image, link, HTML tag or autolink.
    const live = md.replace('Thanks @ian', '').replace(/\\./g, '');
    expect(live).not.toMatch(/[<>[\]!]/);
    expect(live).not.toContain('://');
    expect(live).not.toContain('www.');
    expect(md).toContain('@\u200bzak');
    expect(md).toContain('Agent: @\u200bbot');
    expect(md).toContain('Thanks @ian');
  });

  it('takes no screenshot without an AFK watcher, or when its state is stale', async () => {
    const window = [ev('10:00', '10:30', { app: 'Code', title: 'x' })];
    const noAfk = fakeAw({ [WINDOW]: window });
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: fakePlan().fetch }),
      aw: noAfk,
      now: () => t('10:00'),
      confirm: async () => false,
      openUrl: () => {},
      log: () => {},
    };
    await startSession(deps, 'CON-158', null);
    const captured: string[] = [];
    const shoot = (aw: AwReader, at: string) =>
      screenshotter({
        aw,
        capture: async (file) => {
          captured.push(file);
          await writeFile(file, PNG);
        },
        now: () => t(at),
        log: () => {},
        minGapMs: 0,
      })(config());
    expect(await shoot(noAfk, '10:10')).toBe('unknown');
    const stale = fakeAw({
      [WINDOW]: window,
      [AFK]: [ev('10:00', '10:06', { status: 'not-afk' })],
    });
    expect(await shoot(stale, '10:10')).toBe('unknown');
    expect(await shoot(stale, '10:08')).toBe('taken');
    expect(captured).toHaveLength(1);
  });

  it('refuses a ticket identifier that is not KEY-number', async () => {
    const fetch: Fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      const body =
        path === '/projects/CON'
          ? { columns: COLUMNS }
          : { id: 42, identifier: 'CON-158/../../x', title: 'x', columnId: 1, projectId: 7 };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch }),
      aw: fakeAw(workday()),
      now: () => t('10:00'),
      confirm: async () => false,
      openUrl: () => {},
      log: () => {},
    };
    await expect(startSession(deps, 'CON-158', null)).rejects.toThrow('not a ticket identifier');
    expect(await openSession()).toBeNull();
  });

  it('resumes a failed attach without uploading anything twice', async () => {
    const aw = fakeAw(workday());
    const plan = fakePlan(true);
    let clock = t('10:00');
    let opens = 0;
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const deps: SessionDeps = {
      client: new PlanClient('https://plan.test', 'key', { fetch: plan.fetch, backoffMs: 1 }),
      aw,
      now: () => clock,
      confirm: async () => false,
      openUrl: (url) => {
        opens++;
        opened(url);
      },
      log: () => {},
    };
    const shoot = screenshotter({
      aw,
      capture: (file) => writeFile(file, PNG),
      now: () => clock,
      log: () => {},
      minGapMs: 0,
    });
    await startSession(deps, 'CON-158', null);
    for (const at of ['10:05', '10:10']) {
      clock = t(at);
      expect(await shoot(config())).toBe('taken');
    }
    clock = t('10:30');
    const first = finishSession(deps, config(), 'CON-158', { keep: false });
    const url = await reviewUrl;
    const html = await (await fetch(url)).text();
    const keys = [...html.matchAll(/class="block" value="([0-9a-f]+)"/g)].map((m) => m[1]);
    const shots = [...html.matchAll(/class="shot-box" value="([^"]+)"/g)].map((m) => m[1]);
    const token = new URL(url).searchParams.get('token')!;
    await fetch(new URL(`approve?token=${token}`, url), {
      method: 'POST',
      body: JSON.stringify({ blocks: keys, shots, evidence: 'Done.' }),
    });
    await expect(first).rejects.toThrow('failed with 400');
    expect((await openSession())?.attach?.commented).toBe(false);

    clock = t('10:45');
    await finishSession(deps, config(), 'CON-158', { keep: false });
    expect(opens).toBe(1);
    const posts = plan.requests.filter((r) => r.method === 'POST');
    for (const name of [...shots, 'docket-CON-158-2026-11-02.md']) {
      expect(posts.filter((r) => r.file === name)).toHaveLength(1);
    }
    expect(posts.filter((r) => r.path === '/issues/42/comments')).toHaveLength(2);
    expect(posts.filter((r) => r.path === '/time/agent/blocks')).toHaveLength(1);
    expect(await openSession()).toBeNull();
  });

  it('keeps an outbox block that grew while the review page was open', async () => {
    const block: Block = {
      sourceKey: 'k1k1k1k1',
      source: 'activity',
      startedAt: t('10:00').toISOString(),
      endedAt: t('10:10').toISOString(),
      app: 'Code',
      title: 'a',
      domain: null,
    };
    await addToOutbox([block]);
    const plan = fakePlan();
    let opened: (url: string) => void = () => {};
    const reviewUrl = new Promise<string>((resolve) => {
      opened = resolve;
    });
    const reviewing = reviewOutbox(
      config(),
      new PlanClient('https://plan.test', 'key', { fetch: plan.fetch }),
      {
        yes: false,
        log: () => {},
        openUrl: (url) => opened(url),
      },
    );
    const url = await reviewUrl;
    await addToOutbox([{ ...block, endedAt: t('10:25').toISOString() }]);
    const token = new URL(url).searchParams.get('token')!;
    await fetch(new URL(`approve?token=${token}`, url), {
      method: 'POST',
      body: JSON.stringify({ blocks: ['k1k1k1k1'] }),
    });
    expect(await reviewing).toBe(1);
    expect(times(await readOutbox())).toEqual([['10:00', '10:25']]);
  });

  it('review --yes at a terminal sends nothing unless the answer is yes', async () => {
    await addToOutbox([
      {
        sourceKey: 'k1k1k1k1',
        source: 'activity',
        startedAt: t('10:00').toISOString(),
        endedAt: t('10:10').toISOString(),
        app: 'Code',
        title: 'a',
        domain: null,
      },
    ]);
    const plan = fakePlan();
    const questions: string[] = [];
    const sent = await reviewOutbox(
      config(),
      new PlanClient('https://plan.test', 'key', { fetch: plan.fetch }),
      {
        yes: true,
        log: () => {},
        openUrl: () => {},
        confirm: async (q) => {
          questions.push(q);
          return false;
        },
      },
    );
    expect(sent).toBe(0);
    expect(questions).toEqual(['Send these 1 blocks? (y/N)']);
    expect(plan.requests).toEqual([]);
    expect(await readOutbox()).toHaveLength(1);
  });
});

function times(blocks: Block[]): string[][] {
  return blocks.map((b) => [b.startedAt.slice(11, 16), b.endedAt.slice(11, 16)]);
}
