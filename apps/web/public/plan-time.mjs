#!/usr/bin/env node
/* eslint-disable */
import { createRequire } from 'node:module';
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to =
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, 'default', { value: mod, enumerable: true })
      : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true,
      });
  return to;
};
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/cli.ts
import { hostname } from 'node:os';
import { setTimeout as sleep2 } from 'node:timers/promises';

// src/autostart.ts
import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
var run = promisify(execFile);
var LABEL = 'co.cambray.plan-time';
function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function autostartPath(platform = process.platform) {
  if (platform === 'darwin') return join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData/Roaming');
    return join(appData, 'Microsoft/Windows/Start Menu/Programs/Startup/plan-time.cmd');
  }
  return join(homedir(), '.config/systemd/user/plan-time.service');
}
async function autostartInstalled() {
  return access(autostartPath()).then(
    () => true,
    () => false,
  );
}
function launchdPlist(node, script, args) {
  const argv = [node, script, 'watch', ...args].map((a) => `    <string>${escapeXml(a)}</string>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argv.join(`
`)}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(homedir(), 'Library/Logs/plan-time.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(homedir(), 'Library/Logs/plan-time.log'))}</string>
</dict>
</plist>
`;
}
function systemdUnit(node, script, args) {
  const exec = [node, script, 'watch', ...args].map((a) => JSON.stringify(a)).join(' ');
  return `[Unit]
Description=Plan time agent

[Service]
ExecStart=${exec}
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`;
}
function windowsStartup(node, script, args) {
  const argv = [script, 'watch', ...args].map((a) => `"${a}"`).join(' ');
  return `@echo off\r
start "" /min "${node}" ${argv}\r
`;
}
async function installAutostart(args) {
  const node = process.execPath;
  const script = resolve(process.argv[1] ?? '');
  const path = autostartPath();
  await mkdir(join(path, '..'), { recursive: true });
  if (process.platform === 'darwin') {
    await writeFile(path, launchdPlist(node, script, args));
    await run('launchctl', ['unload', path]).catch(() => {});
    await run('launchctl', ['load', '-w', path]);
  } else if (process.platform === 'win32') {
    await writeFile(path, windowsStartup(node, script, args));
  } else {
    await writeFile(path, systemdUnit(node, script, args));
    await run('systemctl', ['--user', 'daemon-reload']);
    await run('systemctl', ['--user', 'enable', '--now', 'plan-time.service']);
  }
  return path;
}

// src/aw.ts
var AW_URL = 'http://localhost:5600/api/0';
var TIMEOUT_MS = 30000;

class ActivityWatch {
  base;
  constructor(base = AW_URL) {
    this.base = base;
  }
  async get(path) {
    const res = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ActivityWatch GET ${path} failed with ${res.status}`);
    return await res.json();
  }
  async ok() {
    try {
      await this.get('/info');
      return true;
    } catch {
      return false;
    }
  }
  async buckets() {
    const map = await this.get('/buckets');
    return Object.values(map);
  }
  async events(bucketId, start, end) {
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    return this.get(`/buckets/${encodeURIComponent(bucketId)}/events?${query}`);
  }
}
function isWindowBucket(id) {
  return id.startsWith('aw-watcher-window_');
}
function isAfkBucket(id) {
  return id.startsWith('aw-watcher-afk_');
}
function isWebBucket(id) {
  return id.startsWith('aw-watcher-web-');
}
function afkBucketFor(windowId, buckets) {
  const host = windowId.slice('aw-watcher-window_'.length);
  const afk = buckets.filter((b) => isAfkBucket(b.id));
  return afk.find((b) => b.id === `aw-watcher-afk_${host}`) ?? afk[0];
}

// src/client.ts
import { setTimeout as sleep } from 'node:timers/promises';
var CHUNK_SIZE = 2000;
var REQUEST_TIMEOUT_MS = 30000;
var ATTEMPTS = 4;
var BACKOFF_MS = 1000;

class AuthError extends Error {
  constructor() {
    super('Plan rejected the API key (401) — run: plan-time setup');
  }
}

class RequestError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function platformOf(platform) {
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux';
}

class PlanClient {
  url;
  apiKey;
  fetch;
  backoffMs;
  constructor(url, apiKey, options = {}) {
    this.url = url;
    this.apiKey = apiKey;
    this.fetch = options.fetch ?? fetch;
    this.backoffMs = options.backoffMs ?? BACKOFF_MS;
  }
  async post(path, body) {
    let lastError = new Error('no attempt made');
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(this.backoffMs * 2 ** (attempt - 1));
      let res;
      try {
        res = await this.fetch(`${this.url}${path}`, {
          method: 'POST',
          headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (res.status === 401) throw new AuthError();
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 200);
      lastError = new RequestError(res.status, `POST ${path} failed with ${res.status}: ${text}`);
      if (res.status < 500) throw lastError;
    }
    throw lastError;
  }
  async heartbeat(beat) {
    await this.post('/time/agent/heartbeat', beat);
  }
  async uploadBlocks(device, blocks) {
    const total = { inserted: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const result = await this.post('/time/agent/blocks', {
        device,
        blocks: blocks.slice(i, i + CHUNK_SIZE),
      });
      total.inserted += result.inserted ?? 0;
      total.updated += result.updated ?? 0;
      total.skipped += result.skipped ?? 0;
    }
    return total;
  }
}

// src/config.ts
import { mkdir as mkdir2, readFile, writeFile as writeFile2 } from 'node:fs/promises';
import { homedir as homedir2 } from 'node:os';
import { join as join2 } from 'node:path';
var DEFAULT_PRIVATE = {
  apps: [
    '1Password',
    'Bitwarden',
    'KeePassXC',
    'Dashlane',
    'LastPass',
    'Passwords',
    'Keychain Access',
    'Messages',
    'WhatsApp',
    'Telegram',
    'Signal',
    'FaceTime',
    'Health',
    'Wallet',
  ],
  domains: [
    'hsbc.co.uk',
    'barclays.co.uk',
    'lloydsbank.co.uk',
    'halifax.co.uk',
    'natwest.com',
    'santander.co.uk',
    'nationwide.co.uk',
    'tsb.co.uk',
    'firstdirect.com',
    'monzo.com',
    'starlingbank.com',
    'revolut.com',
    'chase.co.uk',
    'wise.com',
    'paypal.com',
    'nhs.uk',
    'patientaccess.com',
    'patient.info',
    'bupa.co.uk',
    'web.whatsapp.com',
    'web.telegram.org',
    'messenger.com',
    'web.snapchat.com',
    '1password.com',
    'bitwarden.com',
    'lastpass.com',
    'dashlane.com',
  ],
  titles: ['incognito', 'private browsing', 'password'],
};
function configDir() {
  return process.env.PLAN_TIME_HOME || join2(homedir2(), '.config', 'plan-time');
}
function configPath() {
  return join2(configDir(), 'config.json');
}
function list(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}
async function loadConfig() {
  let text;
  try {
    text = await readFile(configPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${configPath()} is not valid JSON`);
  }
  const priv = raw.private ?? {};
  const cursor = raw.cursor ?? {};
  return {
    url: typeof raw.url === 'string' ? raw.url.replace(/\/+$/, '') : '',
    device: typeof raw.device === 'string' ? raw.device : '',
    cursor: Object.fromEntries(
      Object.entries(cursor).filter((entry) => {
        return typeof entry[1] === 'string';
      }),
    ),
    private: { apps: list(priv.apps), domains: list(priv.domains), titles: list(priv.titles) },
  };
}
async function saveConfig(config) {
  await mkdir2(configDir(), { recursive: true, mode: 448 });
  await writeFile2(
    configPath(),
    `${JSON.stringify(config, null, 2)}
`,
    { mode: 384 },
  );
}
async function requireConfig() {
  const config = await loadConfig();
  if (!config || !config.url || !config.device) {
    throw new Error('plan-time is not set up yet — run: plan-time setup');
  }
  return config;
}
function isPrivateKind(value) {
  return value === 'apps' || value === 'domains' || value === 'titles';
}
function addPrivate(list2, kind, value) {
  const entry = value.trim();
  const exists = list2[kind].some((v) => v.toLowerCase() === entry.toLowerCase());
  return exists ? list2 : { ...list2, [kind]: [...list2[kind], entry] };
}
function removePrivate(list2, kind, value) {
  const entry = value.trim().toLowerCase();
  return { ...list2, [kind]: list2[kind].filter((v) => v.toLowerCase() !== entry) };
}

// src/credentials.ts
import { execFile as execFile2 } from 'node:child_process';
import {
  chmod,
  readFile as readFile2,
  mkdir as mkdir3,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join as join3 } from 'node:path';
import { promisify as promisify2 } from 'node:util';
var run2 = promisify2(execFile2);
var KEYCHAIN_SERVICE = 'itsaplan_time_key';
function useKeychain() {
  return process.platform === 'darwin' && !process.env.PLAN_TIME_HOME;
}
function credentialsPath() {
  return join3(configDir(), 'credentials');
}
function account() {
  return userInfo().username;
}
async function saveApiKey(key) {
  if (useKeychain()) {
    await run2('security', [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account(),
      '-w',
      key,
    ]);
    return;
  }
  await mkdir3(configDir(), { recursive: true, mode: 448 });
  await writeFile3(
    credentialsPath(),
    `${key}
`,
    { mode: 384 },
  );
  await chmod(credentialsPath(), 384);
}
async function loadApiKey() {
  if (useKeychain()) {
    try {
      const { stdout } = await run2('security', [
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        account(),
        '-w',
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
  try {
    return (await readFile2(credentialsPath(), 'utf8')).trim() || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
function keyLocation() {
  return useKeychain() ? `macOS Keychain (${KEYCHAIN_SERVICE})` : credentialsPath();
}

// src/prompt.ts
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
async function ask(question, fallback = '') {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (
      await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)
    ).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}
function askHidden(question) {
  if (!stdin.isTTY) return ask(question);
  return new Promise((resolve2, reject) => {
    stdout.write(`${question}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (err) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write(`
`);
      if (err) reject(err);
      else resolve2(value.trim());
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\x03') return finish(new Error('cancelled'));
        if (
          ch === '\r' ||
          ch ===
            `
`
        )
          return finish();
        if (ch === '' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// src/calls.ts
import { access as access2 } from 'node:fs/promises';
import { homedir as homedir3 } from 'node:os';
import { join as join4 } from 'node:path';

// src/sqlite.ts
import { execFile as execFile3 } from 'node:child_process';
import { promisify as promisify3 } from 'node:util';
var run3 = promisify3(execFile3);
async function nodeSqlite() {
  try {
    const mod = await import('node:sqlite');
    return typeof mod.DatabaseSync === 'function' ? mod : null;
  } catch {
    return null;
  }
}
async function queryRows(path, sql) {
  const lib = await nodeSqlite();
  if (lib) {
    const db = new lib.DatabaseSync(path, { readOnly: true });
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }
  const { stdout: stdout2 } = await run3('sqlite3', ['-readonly', '-json', path, sql], {
    maxBuffer: 67108864,
  });
  return stdout2.trim() ? JSON.parse(stdout2) : [];
}

// src/transform.ts
import { createHash } from 'node:crypto';
var MERGE_GAP_MS = 60000;
var MIN_BLOCK_MS = 120000;
var MAX_BLOCK_MS = 3 * 60 * 60000;
var BROWSER_WORDS = new Set([
  'chrome',
  'chromium',
  'safari',
  'firefox',
  'arc',
  'brave',
  'edge',
  'msedge',
  'opera',
  'vivaldi',
  'zen',
]);
function isBrowser(app) {
  return app
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => BROWSER_WORDS.has(word));
}
function intervalOf(event) {
  const start = Date.parse(event.timestamp);
  return { start, end: start + Math.max(0, event.duration) * 1000 };
}
function text(value) {
  return typeof value === 'string' ? value : '';
}
function piecesOf(windowEvents) {
  const pieces = [];
  for (const event of windowEvents) {
    const app = text(event.data.app);
    const { start, end } = intervalOf(event);
    if (!app || !Number.isFinite(start) || end <= start) continue;
    pieces.push({ start, end, app, title: text(event.data.title), domain: null });
  }
  return pieces;
}
function coalesce(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else out.push({ ...interval });
  }
  return out;
}
function notAfkIntervals(afkEvents) {
  return coalesce(afkEvents.filter((e) => e.data.status === 'not-afk').map(intervalOf));
}
function clipToIntervals(pieces, intervals) {
  const out = [];
  for (const piece of pieces) {
    for (const interval of intervals) {
      const start = Math.max(piece.start, interval.start);
      const end = Math.min(piece.end, interval.end);
      if (end > start) out.push({ ...piece, start, end });
    }
  }
  return out;
}
function domainOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
function attachDomains(pieces, webEvents) {
  const tabs = webEvents
    .map((event) => ({ ...intervalOf(event), domain: domainOf(text(event.data.url)) }))
    .filter((tab) => tab.domain !== null);
  return pieces.map((piece) => {
    if (!isBrowser(piece.app)) return piece;
    let best = { domain: null, overlap: 0 };
    for (const tab of tabs) {
      const overlap = Math.min(piece.end, tab.end) - Math.max(piece.start, tab.start);
      if (overlap > best.overlap) best = { domain: tab.domain, overlap };
    }
    return { ...piece, domain: best.domain };
  });
}
function sameActivity(a, b) {
  return a.app === b.app && a.title === b.title && a.domain === b.domain;
}
function mergePieces(pieces) {
  const sorted = [...pieces].sort((a, b) => a.start - b.start);
  const out = [];
  for (const piece of sorted) {
    const last = out[out.length - 1];
    if (last && sameActivity(last, piece) && piece.start - last.end < MERGE_GAP_MS) {
      last.end = Math.max(last.end, piece.end);
    } else {
      out.push({ ...piece });
    }
  }
  return out;
}
function splitLong(pieces) {
  const out = [];
  for (const piece of pieces) {
    let start = piece.start;
    while (piece.end - start > MAX_BLOCK_MS) {
      out.push({ ...piece, start, end: start + MAX_BLOCK_MS });
      start += MAX_BLOCK_MS;
    }
    out.push({ ...piece, start });
  }
  return out;
}
function dropShort(pieces) {
  return pieces.filter((piece) => piece.end - piece.start >= MIN_BLOCK_MS);
}
function lower(values) {
  return values.map((v) => v.trim().toLowerCase()).filter(Boolean);
}
function appName(app) {
  return app
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, '');
}
function isPrivate(piece, list2) {
  const app = appName(piece.app);
  const title = piece.title.toLowerCase();
  const domain = piece.domain?.toLowerCase() ?? null;
  if (list2.apps.some((a) => appName(a) === app)) return true;
  if (lower(list2.titles).some((word) => title.includes(word))) return true;
  if (domain && lower(list2.domains).some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  return false;
}
function applyPrivate(pieces, list2) {
  return pieces.filter((piece) => !isPrivate(piece, list2));
}
function startMinuteIso(ms) {
  return new Date(Math.floor(ms / 60000) * 60000).toISOString();
}
function sourceKeyOf(device, app, title, startMs) {
  return createHash('sha256')
    .update([device, app, title, startMinuteIso(startMs)].join('|'))
    .digest('hex');
}
function blockOf(device, piece, source = 'activity', detail) {
  const app = piece.app.slice(0, 200);
  const title = piece.title.slice(0, 500);
  return {
    sourceKey: sourceKeyOf(device, app, title, piece.start),
    source,
    startedAt: new Date(piece.start).toISOString(),
    endedAt: new Date(piece.end).toISOString(),
    app,
    title,
    domain: piece.domain?.slice(0, 253) ?? null,
    ...(detail ? { detail } : {}),
  };
}
function buildBlocks(input) {
  let pieces = piecesOf(input.windowEvents);
  if (input.afkEvents) pieces = clipToIntervals(pieces, notAfkIntervals(input.afkEvents));
  pieces = attachDomains(pieces, input.webEvents);
  pieces = dropShort(splitLong(mergePieces(pieces)));
  pieces = applyPrivate(pieces, input.privateList);
  return pieces.map((piece) => blockOf(input.device, piece));
}

// src/calls.ts
var APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
var CALL_HISTORY_PATH = join4(
  homedir3(),
  'Library/Application Support/CallHistoryDB/CallHistory.storedata',
);
var ADDRESS_BOOK_DIR = join4(homedir3(), 'Library/Application Support/AddressBook');
var FULL_DISK_ACCESS_HINT =
  'Call history is not readable: give your terminal (or node) Full Disk Access in ' +
  'System Settings → Privacy & Security → Full Disk Access.';
function appleSecondsToMs(seconds) {
  return APPLE_EPOCH_MS + seconds * 1000;
}
function msToAppleSeconds(ms) {
  return (ms - APPLE_EPOCH_MS) / 1000;
}
function normaliseNumber(value) {
  return value.replace(/\D/g, '').slice(-10);
}
function contactName(row) {
  const person = [row.first, row.last]
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .join(' ')
    .trim();
  if (person) return person;
  return typeof row.org === 'string' && row.org.trim() ? row.org.trim() : null;
}
function contactsFromRows(rows) {
  const contacts = new Map();
  for (const row of rows) {
    const number = typeof row.number === 'string' ? normaliseNumber(row.number) : '';
    const name = contactName({ first: row.first, last: row.last, org: row.org });
    if (number && name && !contacts.has(number)) contacts.set(number, name);
  }
  return contacts;
}
function callPiece(row, contacts) {
  if (!row.ZANSWERED || !(row.ZDURATION > 0)) return null;
  const number = row.ZADDRESS?.trim() || 'unknown';
  const contact = contacts.get(normaliseNumber(number)) ?? null;
  const start = appleSecondsToMs(row.ZDATE);
  return {
    start,
    end: start + Math.round(row.ZDURATION * 1000),
    app: 'Phone',
    title: `Call with ${contact ?? number}`,
    domain: null,
    detail: { direction: row.ZORIGINATED ? 'out' : 'in', contact, number },
  };
}
function callBlocks(device, rows, contacts) {
  const blocks = [];
  for (const row of rows) {
    const piece = callPiece(row, contacts);
    if (piece) blocks.push(blockOf(device, piece, 'call', piece.detail));
  }
  return blocks;
}
var CALLS_SQL = (sinceAppleSeconds) =>
  'SELECT ZDATE, ZDURATION, ZADDRESS, ZORIGINATED, ZANSWERED FROM ZCALLRECORD ' +
  `WHERE ZDATE > ${Number(sinceAppleSeconds)} ORDER BY ZDATE`;
var CONTACTS_SQL =
  'SELECT p.ZFULLNUMBER AS number, r.ZFIRSTNAME AS first, r.ZLASTNAME AS last, ' +
  'r.ZORGANIZATION AS org FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON p.ZOWNER = r.Z_PK';
async function addressBooks() {
  const { readdir } = await import('node:fs/promises');
  const paths = [];
  const main = join4(ADDRESS_BOOK_DIR, 'AddressBook-v22.abcddb');
  await access2(main)
    .then(() => paths.push(main))
    .catch(() => {});
  const sources = join4(ADDRESS_BOOK_DIR, 'Sources');
  const entries = await readdir(sources).catch(() => []);
  for (const entry of entries) {
    const path = join4(sources, entry, 'AddressBook-v22.abcddb');
    await access2(path)
      .then(() => paths.push(path))
      .catch(() => {});
  }
  return paths;
}
async function readContacts() {
  const contacts = new Map();
  for (const path of await addressBooks()) {
    const rows = await queryRows(path, CONTACTS_SQL).catch(() => []);
    for (const [number, name] of contactsFromRows(rows)) {
      if (!contacts.has(number)) contacts.set(number, name);
    }
  }
  return contacts;
}
async function readCalls(sinceMs, dbPath = CALL_HISTORY_PATH) {
  try {
    const rows = await queryRows(dbPath, CALLS_SQL(msToAppleSeconds(sinceMs)));
    return rows.map((row) => ({
      ZDATE: Number(row.ZDATE),
      ZDURATION: Number(row.ZDURATION ?? 0),
      ZADDRESS: typeof row.ZADDRESS === 'string' ? row.ZADDRESS : null,
      ZORIGINATED: Number(row.ZORIGINATED ?? 0),
      ZANSWERED: Number(row.ZANSWERED ?? 0),
    }));
  } catch (err) {
    throw new Error(
      `${FULL_DISK_ACCESS_HINT} (${
        err.message.split(`
`)[0]
      })`,
    );
  }
}
// package.json
var package_default = {
  name: '@repo/time-agent',
  version: '0.1.0',
  description:
    'Desktop agent that reads ActivityWatch (and macOS call history) and sends time blocks to Plan',
  private: true,
  license: 'AGPL-3.0-only',
  type: 'module',
  bin: {
    'plan-time': './dist/plan-time.mjs',
  },
  engines: {
    node: '>=20',
  },
  scripts: {
    build:
      "bun build src/cli.ts --target=node --outfile dist/plan-time.mjs --banner '/* eslint-disable */' && cp dist/plan-time.mjs ../../apps/web/public/plan-time.mjs && prettier --write ../../apps/web/public/plan-time.mjs",
    lint: 'eslint .',
    test: 'bun test',
    typecheck: 'tsc --noEmit && tsc --noEmit -p tsconfig.test.json',
  },
  devDependencies: {
    '@repo/eslint-config': 'workspace:*',
    '@types/bun': 'latest',
    '@types/node': '^26.6.5',
    eslint: '^9.39.0',
    typescript: '^6.0.3',
  },
};

// src/version.ts
var VERSION = package_default.version;

// src/sync.ts
var MAX_LOOKBACK_MS = 7 * 24 * 60 * 60000;
var REFETCH_MS = MAX_BLOCK_MS + MERGE_GAP_MS;
function firstActivity(windowEvents, afkEvents) {
  let pieces = piecesOf(windowEvents);
  if (afkEvents) pieces = clipToIntervals(pieces, notAfkIntervals(afkEvents));
  return pieces.reduce((min, p) => (min === null || p.start < min ? p.start : min), null);
}
async function readWindow(aw, windowId, afkId, cursor, now) {
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
function newSince(blocks, cursor) {
  if (!cursor) return blocks;
  const at = Date.parse(cursor);
  return blocks.filter((block) => Date.parse(block.endedAt) > at);
}
async function activityBlocks(config, aw, buckets, now, log) {
  const out = new Map();
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
async function phoneBlocks(config, now) {
  const since = now.getTime() - MAX_LOOKBACK_MS;
  const [rows, contacts] = await Promise.all([readCalls(since), readContacts()]);
  return applyPrivate(callBlocks(config.device, rows, contacts), config.private);
}
async function sync(config, apiKey, options) {
  const { log } = options;
  const now = options.now ?? new Date();
  const aw = options.aw ?? new ActivityWatch();
  const client = new PlanClient(config.url, apiKey, { fetch: options.fetch });
  const awOk = await aw.ok();
  if (!options.dryRun) {
    await client.heartbeat({
      device: config.device,
      platform: platformOf(process.platform),
      version: VERSION,
      awOk,
    });
  }
  const perSource = new Map();
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
    for (const block of all) {
      const minutes = Math.round((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60000);
      log(
        `${block.startedAt.slice(0, 16)} ${String(minutes).padStart(4)}m ${block.app}` +
          `${block.domain ? ` (${block.domain})` : ''} — ${block.title}`,
      );
    }
    log(`dry run: ${all.length} blocks, nothing sent`);
    return { awOk, blocks: all.length, uploaded: 0 };
  }
  let uploaded = 0;
  if (all.length > 0) {
    const result = await client.uploadBlocks(config.device, all);
    uploaded = result.inserted + result.updated;
    log(
      `sent ${all.length} blocks: ${result.inserted} new, ${result.updated} updated, ` +
        `${result.skipped} skipped`,
    );
  } else {
    log('nothing new to send');
  }
  for (const id of perSource.keys()) config.cursor[id] = now.toISOString();
  await saveConfig(config);
  return { awOk, blocks: all.length, uploaded };
}

// src/cli.ts
var WATCH_INTERVAL_MS = 15 * 60000;
var USAGE = `plan-time ${VERSION} — sends your activity to Plan as time blocks

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
function log(message) {
  console.log(`[plan-time] ${message}`);
}
async function requireApiKey() {
  const key = await loadApiKey();
  if (!key) throw new Error(`no API key found in ${keyLocation()} — run: plan-time setup`);
  return key;
}
var DEFAULT_API_URL = 'https://plan-api.cambray.co';
async function setup(urlArg) {
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
  const config = {
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
async function runSync(flags) {
  const config = await requireConfig();
  const dryRun = flags.has('--dry-run');
  const apiKey = dryRun ? '' : await requireApiKey();
  await sync(config, apiKey, { calls: flags.has('--calls'), dryRun, log });
}
async function watch(flags) {
  await requireConfig();
  const apiKey = await requireApiKey();
  const stopped = new AbortController();
  const stop = () => {
    log('stopping');
    stopped.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log(`syncing every ${WATCH_INTERVAL_MS / 60000} minutes`);
  while (!stopped.signal.aborted) {
    try {
      const config = await requireConfig();
      await sync(config, apiKey, { calls: flags.has('--calls'), dryRun: false, log });
    } catch (err) {
      if (err instanceof AuthError) throw err;
      log(`sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep2(WATCH_INTERVAL_MS, undefined, { signal: stopped.signal }).catch(() => {});
  }
}
async function status() {
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
async function privateCommand(args) {
  const config = await requireConfig();
  const [action, kind, ...rest] = args;
  if (action === 'list') {
    for (const key of ['apps', 'domains', 'titles']) {
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
async function main(argv) {
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
      throw new Error(`unknown command ${command}

${USAGE}`);
  }
}
main(process.argv.slice(2)).catch((err) => {
  console.error(`[plan-time] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
