import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Fetch } from '../client';
import { loadConfig, type Config } from '../config';
import { sync, type AwReader } from '../sync';
import { sourceKeyOf, type AwEvent, type Block } from '../transform';

const saved = process.env.PLAN_TIME_HOME;

beforeEach(async () => {
  process.env.PLAN_TIME_HOME = await mkdtemp(join(tmpdir(), 'plan-time-sync-'));
});

afterAll(() => {
  if (saved === undefined) delete process.env.PLAN_TIME_HOME;
  else process.env.PLAN_TIME_HOME = saved;
});

const DAY = '2026-11-02T';
const WINDOW = 'aw-watcher-window_mac';
const AFK = 'aw-watcher-afk_mac';

function t(clock: string): Date {
  return new Date(`${DAY}${clock}:00.000Z`);
}

// Returns whole events that overlap the range, as ActivityWatch does.
function fakeAw(buckets: Record<string, AwEvent[]>, ok = true): AwReader {
  return {
    ok: async () => ok,
    buckets: async () => Object.keys(buckets).map((id) => ({ id, type: '' })),
    events: async (id, start, end) =>
      (buckets[id] ?? []).filter((e) => {
        const s = Date.parse(e.timestamp);
        return s <= end.getTime() && s + e.duration * 1000 >= start.getTime();
      }),
  };
}

interface Upload {
  path: string;
  body: { device?: string; blocks?: Block[] };
}

function fakePlan(): { fetch: Fetch; uploads: Upload[] } {
  const uploads: Upload[] = [];
  const fetch: Fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = JSON.parse(String(init?.body)) as Upload['body'];
    uploads.push({ path, body });
    const reply =
      path === '/time/agent/blocks'
        ? { inserted: body.blocks?.length ?? 0, updated: 0, skipped: 0 }
        : { name: body.device };
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  return { fetch, uploads };
}

function config(): Config {
  return {
    url: 'https://plan.test',
    device: 'mac',
    cursor: {},
    private: { apps: [], domains: [], titles: [] },
  };
}

// Five-minute events of the same window, ten seconds apart, from `from` for `hours`.
function run(from: string, hours: number): AwEvent[] {
  const events: AwEvent[] = [];
  for (let ms = t(from).getTime(); ms < t(from).getTime() + hours * 3_600_000; ms += 300_000) {
    events.push({
      timestamp: new Date(ms).toISOString(),
      duration: 290,
      data: { app: 'Code', title: 'main.ts' },
    });
  }
  return events;
}

const log = () => {};

describe('sync', () => {
  it('keeps the keys of a run longer than the refetch window stable across syncs', async () => {
    const aw = fakeAw({
      [WINDOW]: run('07:00', 5),
      [AFK]: [
        { timestamp: t('07:00').toISOString(), duration: 5 * 3600, data: { status: 'not-afk' } },
      ],
    });
    const plan = fakePlan();
    const cfg = config();
    const options = { calls: false, dryRun: false, log, aw, fetch: plan.fetch };

    await sync(cfg, 'key', { ...options, now: t('10:58') });
    const first = plan.uploads.find((u) => u.path === '/time/agent/blocks')!.body.blocks!;
    expect(first.map((b) => [b.startedAt, b.endedAt])).toEqual([
      [t('07:00').toISOString(), t('10:00').toISOString()],
      [t('10:00').toISOString(), `${DAY}10:59:50.000Z`],
    ]);
    expect(cfg.cursor[WINDOW]).toBe(t('10:58').toISOString());

    plan.uploads.length = 0;
    await sync(await loadConfig().then((c) => c!), 'key', { ...options, now: t('11:58') });
    const second = plan.uploads.find((u) => u.path === '/time/agent/blocks')!.body.blocks!;
    expect(second).toHaveLength(1);
    expect(second[0].sourceKey).toBe(sourceKeyOf('mac', 'Code', 'main.ts', t('10:00').getTime()));
    expect(second[0]).toMatchObject({
      startedAt: t('10:00').toISOString(),
      endedAt: `${DAY}11:59:50.000Z`,
    });
  });

  it('sends a heartbeat with awOk false and nothing else when ActivityWatch is down', async () => {
    const plan = fakePlan();
    const result = await sync(config(), 'key', {
      calls: false,
      dryRun: false,
      log,
      aw: fakeAw({}, false),
      fetch: plan.fetch,
      now: t('10:00'),
    });
    expect(result).toEqual({ awOk: false, blocks: 0, uploaded: 0 });
    expect(plan.uploads.map((u) => u.path)).toEqual(['/time/agent/heartbeat']);
    expect(plan.uploads[0].body).toMatchObject({ device: 'mac', awOk: false });
  });
});
