#!/usr/bin/env node
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { autostartInstalled, autostartPath, installAutostart } from './autostart';
import { ActivityWatch } from './aw';
import { AuthError, PlanClient, platformOf } from './client';
import {
  addPrivate,
  configPath,
  DEFAULT_PRIVATE,
  isPrivateKind,
  loadConfig,
  removePrivate,
  requireConfig,
  saveConfig,
  type Config,
} from './config';
import { keyLocation, loadApiKey, saveApiKey } from './credentials';
import { ask, askHidden } from './prompt';
import { sync } from './sync';
import { VERSION } from './version';

const WATCH_INTERVAL_MS = 15 * 60_000;

const USAGE = `plan-time ${VERSION} — sends your activity to Plan as time blocks

Usage: plan-time <command> [options]

  setup [api-url]           ask for the Plan API URL, API key and device name
  sync [--calls] [--dry-run]
                            send everything since the last sync (at most 7 days)
  watch [--calls]           sync every 15 minutes, in the foreground
  install-autostart [--calls]
                            start 'watch' at login (opt-in: launchd / Startup folder / systemd)
  status                    what is configured and when each source last synced
  private list              show the private list (never sent to Plan)
  private add <apps|domains|titles> <value>
  private remove <apps|domains|titles> <value>

--calls also reads iPhone calls synced to this Mac (needs Full Disk Access).`;

function log(message: string): void {
  console.log(`[plan-time] ${message}`);
}

async function requireApiKey(): Promise<string> {
  const key = await loadApiKey();
  if (!key) throw new Error(`no API key found in ${keyLocation()} — run: plan-time setup`);
  return key;
}

const DEFAULT_API_URL = 'https://plan-api.cambray.co';

// The URL is the API's origin (the Setup page passes it), not the web app's.
async function setup(urlArg: string | undefined): Promise<void> {
  const existing = await loadConfig();
  const url = (await ask('Plan API URL', urlArg || existing?.url || DEFAULT_API_URL)).replace(
    /\/+$/,
    '',
  );
  const device = await ask('Device name', existing?.device || hostname());
  const key = await askHidden('API key (from Plan → Settings → API keys)');
  if (!key) throw new Error('an API key is required');

  const aw = new ActivityWatch();
  const awOk = await aw.ok();
  const client = new PlanClient(url, key);
  await client.heartbeat({
    device,
    platform: platformOf(process.platform),
    version: VERSION,
    awOk,
  });

  await saveApiKey(key);
  const config: Config = {
    url,
    device,
    cursor: existing?.cursor ?? {},
    private: existing?.private ?? DEFAULT_PRIVATE,
  };
  await saveConfig(config);
  log(`key saved to ${keyLocation()}, config in ${configPath()}`);
  log(
    awOk
      ? 'ActivityWatch is running'
      : 'ActivityWatch is not running — start it, then: plan-time sync',
  );
}

async function runSync(flags: Set<string>): Promise<void> {
  const config = await requireConfig();
  const dryRun = flags.has('--dry-run');
  const apiKey = dryRun ? '' : await requireApiKey();
  await sync(config, apiKey, { calls: flags.has('--calls'), dryRun, log });
}

async function watch(flags: Set<string>): Promise<void> {
  await requireConfig();
  const apiKey = await requireApiKey();
  const stopped = new AbortController();
  const stop = () => {
    log('stopping');
    stopped.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log(`syncing every ${WATCH_INTERVAL_MS / 60_000} minutes`);
  while (!stopped.signal.aborted) {
    try {
      // Read again each time, so a `private add` made meanwhile applies to the next sync.
      const config = await requireConfig();
      await sync(config, apiKey, { calls: flags.has('--calls'), dryRun: false, log });
    } catch (err) {
      if (err instanceof AuthError) throw err;
      log(`sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(WATCH_INTERVAL_MS, undefined, { signal: stopped.signal }).catch(() => {});
  }
}

async function status(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    log(`not set up (${configPath()} missing) — run: plan-time setup`);
    return;
  }
  const key = await loadApiKey();
  const awOk = await new ActivityWatch().ok();
  log(`url      ${config.url}`);
  log(`device   ${config.device}`);
  log(`key      ${key ? 'present' : 'missing'} (${keyLocation()})`);
  log(`tracker  ${awOk ? 'ActivityWatch running' : 'ActivityWatch not running'}`);
  log(
    `autostart ${(await autostartInstalled()) ? 'installed' : 'not installed'} (${autostartPath()})`,
  );
  const sources = Object.entries(config.cursor);
  if (sources.length === 0) log('last sync: never');
  for (const [id, at] of sources) log(`last sync ${id}: ${at}`);
  const { apps, domains, titles } = config.private;
  log(`private  ${apps.length} apps, ${domains.length} domains, ${titles.length} title words`);
}

async function privateCommand(args: string[]): Promise<void> {
  const config = await requireConfig();
  const [action, kind, ...rest] = args;
  if (action === 'list') {
    for (const key of ['apps', 'domains', 'titles'] as const) {
      log(`${key}: ${config.private[key].join(', ') || '(none)'}`);
    }
    return;
  }
  const value = rest.join(' ').trim();
  if ((action !== 'add' && action !== 'remove') || !kind || !isPrivateKind(kind) || !value) {
    throw new Error('usage: plan-time private add|remove <apps|domains|titles> <value>');
  }
  config.private =
    action === 'add'
      ? addPrivate(config.private, kind, value)
      : removePrivate(config.private, kind, value);
  await saveConfig(config);
  log(`${action === 'add' ? 'added' : 'removed'} ${kind}: ${value}`);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  for (const flag of flags) {
    if (flag !== '--calls' && flag !== '--dry-run') throw new Error(`unknown option ${flag}`);
  }
  switch (command) {
    case 'setup':
      return setup(args[0]);
    case 'sync':
      return runSync(flags);
    case 'watch':
      return watch(flags);
    case 'install-autostart': {
      const path = await installAutostart([...flags].filter((f) => f === '--calls'));
      log(`installed: ${path}`);
      return;
    }
    case 'status':
      return status();
    case 'private':
      return privateCommand(args);
    case '--version':
    case 'version':
      console.log(VERSION);
      return;
    case undefined:
    case 'help':
    case '--help':
      console.log(USAGE);
      return;
    default:
      throw new Error(`unknown command ${command}\n\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`[plan-time] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
