import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPrivate, DEFAULT_PRIVATE, loadConfig, removePrivate, saveConfig } from '../config';
import { loadApiKey, saveApiKey } from '../credentials';

const saved = process.env.PLAN_TIME_HOME;

beforeEach(async () => {
  process.env.PLAN_TIME_HOME = await mkdtemp(join(tmpdir(), 'plan-time-'));
});

afterAll(() => {
  if (saved === undefined) delete process.env.PLAN_TIME_HOME;
  else process.env.PLAN_TIME_HOME = saved;
});

describe('config file', () => {
  it('is null before setup and round-trips after', async () => {
    expect(await loadConfig()).toBeNull();
    await saveConfig({
      url: 'https://plan.test/',
      device: 'mac',
      cursor: { 'aw-watcher-window_mac': '2026-11-02T09:00:00.000Z' },
      private: DEFAULT_PRIVATE,
    });
    const config = await loadConfig();
    expect(config).toMatchObject({ url: 'https://plan.test', device: 'mac' });
    expect(config?.cursor['aw-watcher-window_mac']).toBe('2026-11-02T09:00:00.000Z');
    expect(config?.private.domains).toContain('hsbc.co.uk');
  });
});

describe('private list', () => {
  it('adds once, case-insensitively, and removes', () => {
    let list = addPrivate(DEFAULT_PRIVATE, 'apps', 'Slack');
    list = addPrivate(list, 'apps', 'slack');
    expect(list.apps.filter((a) => a.toLowerCase() === 'slack')).toHaveLength(1);
    list = removePrivate(list, 'apps', 'SLACK');
    expect(list.apps).not.toContain('Slack');
    expect(DEFAULT_PRIVATE.apps).toContain('1Password');
  });
});

describe('credentials file', () => {
  it('stores the key readable by the owner only', async () => {
    await saveApiKey('secret-key');
    expect(await loadApiKey()).toBe('secret-key');
    const path = join(process.env.PLAN_TIME_HOME!, 'credentials');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(
      await readFile(join(process.env.PLAN_TIME_HOME!, 'config.json'), 'utf8').catch(() => ''),
    ).not.toContain('secret-key');
  });
});
