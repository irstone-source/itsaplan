#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { autostartInstalled, autostartPath, installAutostart } from './autostart';
import { ActivityWatch } from './aw';
import { systemCapturer } from './capture';
import { AuthError, PlanClient, platformOf, readSentLog, sentLogPath } from './client';
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
import {
  finishSession,
  pauseSession,
  screenshotter,
  SHOT_INTERVAL_MS,
  startSession,
  type SessionDeps,
  type ShotResult,
} from './session';
import { dataDir, deleteSession, isPaused, listShots, openSession, readOutbox } from './store';
import { reviewOutbox, sync } from './sync';
import { VERSION } from './version';

const WATCH_INTERVAL_MS = 15 * 60_000;

const USAGE = `plan-time ${VERSION} — records your activity as time blocks and sends to Plan
only what you approve

Usage: plan-time <command> [options]

  setup [api-url]           ask for the Plan API URL, API key and device name
  sync [--calls] [--dry-run]
                            read activity since the last sync (at most 7 days) into the
                            outbox on this computer; nothing is sent
  watch [--calls]           sync every 15 minutes, in the foreground; takes the session's
                            screenshots while a session is open
  review [--yes]            open the review page for the outbox and send what you tick;
                            --yes lists the blocks here and sends all of them
  start <TICKET> [--agent <name>]
                            open a work session on a ticket and take a screenshot every
                            5 minutes, in the foreground
  pause | resume            stop and restart the session's screenshots and time
  finish <TICKET> [--keep]  build the session's evidence docket and open the review page;
                            Attach uploads only what you tick
  discard                   delete the open session and its screenshots
  sent                      every request this computer has made to Plan
  install-autostart [--calls]
                            start 'watch' at login (opt-in: launchd / Startup folder / systemd)
  status                    configuration, open session, outbox and last sync per source
  private list              show the private list (never recorded)
  private add <apps|domains|titles> <value>
  private remove <apps|domains|titles> <value>

--calls also reads iPhone calls synced to this Mac (needs Full Disk Access).`;

const FLAGS = new Set(['--calls', '--dry-run', '--keep', '--yes']);

const SKIPPED: Partial<Record<ShotResult, string>> = {
  afk: 'you are away',
  private: 'a private app, title or site is in front',
  unknown: 'ActivityWatch cannot say what is in front or whether you are away',
};

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
  const apiKey = dryRun ? null : await requireApiKey();
  await sync(config, apiKey, { calls: flags.has('--calls'), dryRun, log });
}

function stopSignal(): AbortSignal {
  const stopped = new AbortController();
  const stop = () => {
    log('stopping');
    stopped.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return stopped.signal;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shooter() {
  return screenshotter({
    aw: new ActivityWatch(),
    capture: systemCapturer(),
    now: () => new Date(),
    log,
    minGapMs: SHOT_INTERVAL_MS / 2,
  });
}

async function watch(flags: Set<string>): Promise<void> {
  await requireConfig();
  const apiKey = await requireApiKey();
  const signal = stopSignal();
  const shoot = shooter();
  let lastSync = 0;
  log(
    `reading activity every ${WATCH_INTERVAL_MS / 60_000} minutes; nothing is sent until you run: plan-time review`,
  );
  while (!signal.aborted) {
    // Read again each time, so a `private add` made meanwhile applies to the next sync.
    const config = await requireConfig();
    if (Date.now() - lastSync >= WATCH_INTERVAL_MS) {
      lastSync = Date.now();
      try {
        await sync(config, apiKey, { calls: flags.has('--calls'), dryRun: false, log });
      } catch (err) {
        if (err instanceof AuthError) throw err;
        log(`sync failed: ${errorText(err)}`);
      }
    }
    try {
      if ((await shoot(config)) === 'taken') log('screenshot taken for the open session');
    } catch (err) {
      log(`screenshot failed: ${errorText(err)}`);
    }
    await sleep(SHOT_INTERVAL_MS, undefined, { signal }).catch(() => {});
  }
}

function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => log('could not open a browser; open the URL above yourself'));
  child.unref();
}

async function confirm(question: string): Promise<boolean> {
  return /^y(es)?$/i.test(await ask(question));
}

async function sessionDeps(): Promise<{ config: Config; deps: SessionDeps }> {
  const config = await requireConfig();
  const client = new PlanClient(config.url, await requireApiKey());
  const deps: SessionDeps = {
    client,
    aw: new ActivityWatch(),
    now: () => new Date(),
    confirm,
    openUrl,
    log,
  };
  return { config, deps };
}

async function review(flags: Set<string>): Promise<void> {
  const config = await requireConfig();
  const client = new PlanClient(config.url, await requireApiKey());
  await reviewOutbox(config, client, {
    yes: flags.has('--yes'),
    log,
    openUrl,
    confirm: process.stdin.isTTY ? confirm : undefined,
  });
}

async function start(identifier: string | undefined, agent: string | null): Promise<void> {
  if (!identifier) throw new Error('usage: plan-time start <TICKET> [--agent <name>]');
  const { deps } = await sessionDeps();
  await startSession(deps, identifier, agent);
  const signal = stopSignal();
  const shoot = shooter();
  log(
    `a screenshot every ${SHOT_INTERVAL_MS / 60_000} minutes, kept on this computer, ` +
      'skipped when you are away or a private app is in front. Ctrl-C stops screenshots; ' +
      'the session stays open until: plan-time finish',
  );
  while (!signal.aborted) {
    try {
      const result = await shoot(await requireConfig());
      if (result === 'no-session') {
        log('the session was closed');
        return;
      }
      if (result === 'taken') log('screenshot taken');
      else if (result in SKIPPED) log(`screenshot skipped: ${SKIPPED[result]}`);
    } catch (err) {
      log(`screenshot failed: ${errorText(err)}`);
    }
    await sleep(SHOT_INTERVAL_MS, undefined, { signal }).catch(() => {});
  }
}

async function finish(identifier: string | undefined, flags: Set<string>): Promise<void> {
  if (!identifier) throw new Error('usage: plan-time finish <TICKET> [--keep]');
  const { config, deps } = await sessionDeps();
  await finishSession(deps, config, identifier, { keep: flags.has('--keep') });
}

async function discard(): Promise<void> {
  const session = await openSession();
  if (!session) throw new Error('no open session');
  await deleteSession(session.id);
  log(`discarded the session for ${session.identifier}; nothing was sent`);
}

async function sent(): Promise<void> {
  const text = await readSentLog();
  if (!text) log(`nothing sent yet (${sentLogPath()})`);
  else process.stdout.write(text);
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
  log(`outbox   ${(await readOutbox()).length} blocks waiting for review (${dataDir()})`);
  const session = await openSession();
  if (!session) {
    log('session  none open');
    return;
  }
  const shots = await listShots(session.id);
  log(
    `session  ${session.identifier} ${session.title}${session.agent ? ` (agent ${session.agent})` : ''}, ` +
      `since ${session.startedAt}, ${shots.length} screenshots${isPaused(session) ? ', paused' : ''}`,
  );
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
  const flags = new Set<string>();
  const args: string[] = [];
  let agent: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--agent' || arg.startsWith('--agent=')) {
      agent = (arg === '--agent' ? rest[++i] : arg.slice('--agent='.length))?.trim() || null;
      if (!agent) throw new Error('--agent needs a name');
    } else if (arg.startsWith('--')) {
      if (!FLAGS.has(arg)) throw new Error(`unknown option ${arg}`);
      flags.add(arg);
    } else {
      args.push(arg);
    }
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
    case 'review':
      return review(flags);
    case 'start':
      return start(args[0], agent);
    case 'pause':
    case 'resume': {
      const session = await pauseSession(command === 'pause', new Date());
      log(`${session.identifier} ${command === 'pause' ? 'paused' : 'resumed'}`);
      return;
    }
    case 'finish':
      return finish(args[0], flags);
    case 'discard':
      return discard();
    case 'sent':
      return sent();
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
