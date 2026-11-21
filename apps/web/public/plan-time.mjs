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
import { spawn } from 'node:child_process';
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

// src/capture.ts
import { execFile as execFile2 } from 'node:child_process';
import { promisify as promisify2 } from 'node:util';
var run2 = promisify2(execFile2);
var WINDOWS_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
  '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen',
  '$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
  '$g = [System.Drawing.Graphics]::FromImage($bmp)',
  '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)',
  '$bmp.Save($env:PLAN_TIME_SHOT, [System.Drawing.Imaging.ImageFormat]::Png)',
].join('; ');
function commandsFor(platform) {
  if (platform === 'darwin') return [(f) => ['screencapture', ['-x', '-t', 'png', f]]];
  if (platform === 'win32') {
    return [
      (f) => [
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT],
        { ...process.env, PLAN_TIME_SHOT: f },
      ],
    ];
  }
  return [
    (f) => ['grim', [f]],
    (f) => ['gnome-screenshot', ['-f', f]],
    (f) => ['import', ['-window', 'root', f]],
  ];
}
function systemCapturer(platform = process.platform) {
  let commands = commandsFor(platform);
  return async (file) => {
    let lastError = new Error('no screenshot tool found');
    for (const command of commands) {
      const [bin, args, env] = command(file);
      try {
        await run2(bin, args, { env, timeout: 30000 });
        commands = [command];
        if (platform === 'darwin') {
          await run2('sips', ['-Z', '2560', file], { timeout: 30000 }).catch(() => {});
        }
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };
}

// src/client.ts
import { appendFile, mkdir as mkdir3, readFile as readFile2 } from 'node:fs/promises';
import { join as join3 } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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

// src/client.ts
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
function sentLogPath() {
  return join3(configDir(), 'sent.log');
}
async function readSentLog() {
  try {
    return await readFile2(sentLogPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}
async function logSent(method, path, bytes, label) {
  await mkdir3(configDir(), { recursive: true, mode: 448 });
  const line = [new Date().toISOString(), method, path, String(bytes), label].join('\t');
  await appendFile(
    sentLogPath(),
    `${line}
`,
    { mode: 384 },
  );
}
function parseIdentifier(identifier) {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(identifier.trim());
  if (!match) throw new Error(`${identifier} is not a ticket identifier like CON-158`);
  return { key: match[1].toUpperCase(), number: Number(match[2]) };
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
  async request(method, path, label, payload = { bytes: 0 }) {
    let lastError = new Error('no attempt made');
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(this.backoffMs * 2 ** (attempt - 1));
      await logSent(method, path, payload.bytes, label);
      const headers = { 'x-api-key': this.apiKey };
      if (payload.contentType) headers['content-type'] = payload.contentType;
      let res;
      try {
        res = await this.fetch(`${this.url}${path}`, {
          method,
          headers,
          body: payload.body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (res.status === 401) throw new AuthError();
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 200);
      lastError = new RequestError(
        res.status,
        `${method} ${path} failed with ${res.status}: ${text}`,
      );
      if (res.status < 500) throw lastError;
    }
    throw lastError;
  }
  send(method, path, label, json) {
    const body = JSON.stringify(json);
    return this.request(method, path, label, {
      body,
      contentType: 'application/json',
      bytes: Buffer.byteLength(body),
    });
  }
  async heartbeat(beat) {
    await this.send('POST', '/time/agent/heartbeat', 'heartbeat', beat);
  }
  async uploadBlocks(device, blocks) {
    const total = { inserted: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const chunk = blocks.slice(i, i + CHUNK_SIZE);
      const result = await this.send('POST', '/time/agent/blocks', `${chunk.length} time blocks`, {
        device,
        blocks: chunk,
      });
      total.inserted += result.inserted ?? 0;
      total.updated += result.updated ?? 0;
      total.skipped += result.skipped ?? 0;
    }
    return total;
  }
  async me() {
    const res = await this.request('GET', '/me', 'read: who am I');
    return res.authenticated && res.user ? res.user : null;
  }
  async issue(identifier) {
    const { key, number } = parseIdentifier(identifier);
    return this.request(
      'GET',
      `/projects/${encodeURIComponent(key)}/issues/${number}`,
      `read: ticket ${key}-${number}`,
    );
  }
  async columns(projectKey) {
    const res = await this.request(
      'GET',
      `/projects/${encodeURIComponent(projectKey)}`,
      `read: columns of ${projectKey}`,
    );
    return [...res.columns].sort((a, b) => a.position - b.position);
  }
  async moveIssue(issue, column) {
    await this.send('PATCH', `/issues/${issue.id}`, `move ${issue.identifier} to ${column.name}`, {
      columnId: column.id,
    });
  }
  async uploadAttachment(issue, filename, contentType, bytes) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: contentType }), filename);
    const encoded = new Response(form);
    const body = new Uint8Array(await encoded.arrayBuffer());
    return this.request(
      'POST',
      `/issues/${issue.id}/attachments`,
      `file ${filename} for ${issue.identifier}`,
      {
        body,
        contentType: encoded.headers.get('content-type') ?? 'multipart/form-data',
        bytes: body.byteLength,
      },
    );
  }
  async createDocket(issue, docket) {
    return this.send(
      'POST',
      `/issues/${issue.id}/dockets`,
      `docket for ${issue.identifier}`,
      docket,
    );
  }
}

// src/credentials.ts
import { execFile as execFile3 } from 'node:child_process';
import {
  chmod,
  readFile as readFile3,
  mkdir as mkdir4,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join as join4 } from 'node:path';
import { promisify as promisify3 } from 'node:util';
var run3 = promisify3(execFile3);
var KEYCHAIN_SERVICE = 'itsaplan_time_key';
function useKeychain() {
  return process.platform === 'darwin' && !process.env.PLAN_TIME_HOME;
}
function credentialsPath() {
  return join4(configDir(), 'credentials');
}
function account() {
  return userInfo().username;
}
async function saveApiKey(key) {
  if (useKeychain()) {
    await run3('security', [
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
  await mkdir4(configDir(), { recursive: true, mode: 448 });
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
      const { stdout } = await run3('security', [
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
    return (await readFile3(credentialsPath(), 'utf8')).trim() || null;
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

// src/session.ts
import { randomBytes as randomBytes2 } from 'node:crypto';
import { readFile as readFile6, rm as rm2 } from 'node:fs/promises';
import { join as join6 } from 'node:path';

// src/review.ts
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile as readFile4 } from 'node:fs/promises';
import { createServer } from 'node:http';
var REVIEW_TIMEOUT_MS = 30 * 60000;
var MAX_BODY_BYTES = 1024 * 1024;
var DONE_HEADERS = { 'content-type': 'application/json', connection: 'close' };
function esc(value) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function hhmm(iso) {
  return iso.slice(11, 16);
}
function minutes(block) {
  return Math.round((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60000);
}
function page(input, token) {
  const docket = input.docket;
  const button = docket ? 'Attach' : 'Send';
  const rows = input.blocks
    .map(
      (b) =>
        `<tr><td><input type="checkbox" class="block" value="${esc(b.sourceKey)}" checked></td>` +
        `<td>${esc(b.startedAt.slice(0, 10))} ${hhmm(b.startedAt)}–${hhmm(b.endedAt)}</td>` +
        `<td>${minutes(b)}m</td><td>${esc(b.app)}</td><td>${esc(b.domain ?? '')}</td>` +
        `<td>${esc(b.title)}</td></tr>`,
    )
    .join('');
  const shots = input.shots
    .map(
      (s) =>
        `<label class="shot"><img src="shot?name=${encodeURIComponent(s.name)}&token=${token}" alt="${esc(s.name)}">` +
        `<span><input type="checkbox" class="shot-box" value="${esc(s.name)}" checked> ${esc(s.name)}` +
        ` (${s.bytes.toLocaleString('en-GB')} bytes)</span></label>`,
    )
    .join('');
  const data = JSON.stringify({
    docket: docket ?? null,
    shots: input.shots.map((s) => ({ name: s.name, bytes: s.bytes })),
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>plan-time review</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px;color:#1b1b1b;background:#fff}
.banner{background:#e7f6ec;border:1px solid #86c99b;padding:10px 14px;border-radius:6px;font-weight:600}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.shot img{width:100%;border:1px solid #ccc;display:block}
textarea{width:100%;min-height:90px;font:inherit}
.uploads{background:#f6f6f6;border:1px solid #ddd;padding:10px 14px;border-radius:6px}
.note{color:#8a4b00}
button{font:inherit;padding:8px 18px;margin-right:8px;cursor:pointer}
</style></head><body>
<p class="banner">Nothing has been sent from this computer.</p>
<h1>${esc(input.heading)}</h1>
<p>Untick anything you do not want to send. Unticked items are deleted from this computer and never sent.</p>
<h2>Time blocks</h2>
${rows ? `<table><tr><th></th><th>When (UTC)</th><th>Length</th><th>App</th><th>Site</th><th>Window</th></tr>${rows}</table>` : '<p>No time blocks.</p>'}
${
  docket
    ? `<h2>Screenshots</h2><p class="note">A screenshot shows everything on the screen at that moment, including windows that were not in front and notifications. Untick a screenshot to keep it off the ticket; it is then deleted from this computer.</p>${shots ? `<div class="shots">${shots}</div>` : '<p>No screenshots.</p>'}
<h2>Evidence this is complete, or the blocker</h2>
<p><label><input type="radio" name="outcome" value="complete" checked> Complete</label> &nbsp; <label><input type="radio" name="outcome" value="blocked"> Blocked</label></p>
<textarea id="evidence" placeholder="Complete: what shows the outcome is done (link, result, sign-off). Blocked: what is stopping it and who can unblock it."></textarea>
<p class="note" id="need" hidden>Write the evidence or the blocker before attaching.</p>`
    : ''
}
<h2>What ${button} will upload</h2>
<div class="uploads"><ul id="uploads"></ul>
${docket ? '<p class="note">Attached screenshots can be viewed by anyone who has their link.</p>' : ''}</div>
<p><button id="go">${button}</button><button id="cancel">Cancel</button></p>
<script>
const DATA = ${data};
const TOKEN = new URLSearchParams(location.search).get('token');
const ticked = (cls) => [...document.querySelectorAll('.' + cls)].filter((b) => b.checked).map((b) => b.value);
const evidence = () => (document.getElementById('evidence') || { value: '' }).value;
const outcome = () => (document.querySelector('input[name=outcome]:checked') || { value: 'complete' }).value;
function update() {
  const items = [];
  const shots = ticked('shot-box');
  for (const s of DATA.shots) if (shots.includes(s.name)) items.push(s.name + ' — ' + s.bytes.toLocaleString('en-GB') + ' bytes, attached to ' + DATA.docket.identifier);
  if (DATA.docket) {
    const bytes = DATA.docket.baseBytes + new TextEncoder().encode(evidence()).length;
    items.push(DATA.docket.filename + ' — about ' + bytes.toLocaleString('en-GB') + ' bytes, attached to ' + DATA.docket.identifier);
    const id = DATA.docket.identifier;
    items.push('a stamped docket on ' + id + (outcome() === 'blocked' ? '; ' + id + ' stays open' : ' (sent to a lead for review)'));
  }
  const blocks = ticked('block').length;
  items.push(blocks + ' time block' + (blocks === 1 ? '' : 's') + (DATA.docket ? ', logged against ' + DATA.docket.identifier : ''));
  document.getElementById('uploads').innerHTML = '';
  for (const text of items) { const li = document.createElement('li'); li.textContent = text; document.getElementById('uploads').append(li); }
}
document.addEventListener('change', update);
document.addEventListener('input', update);
update();
async function finish(path, body) {
  const res = await fetch(path + '?token=' + encodeURIComponent(TOKEN), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  document.body.innerHTML = res.ok ? '<p class="banner">Done. The terminal shows what was sent. You can close this tab.</p>' : '<p>Failed: ' + res.status + '</p>';
}
document.getElementById('go').onclick = () => {
  if (DATA.docket && !evidence().trim()) { document.getElementById('need').hidden = false; return; }
  finish('approve', { blocks: ticked('block'), shots: ticked('shot-box'), outcome: outcome(), evidence: evidence() });
};
document.getElementById('cancel').onclick = () => finish('cancel', {});
</script></body></html>`;
}
function tokenOk(given, token) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function readBody(req) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve2(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}
async function startReview(input) {
  const token = randomBytes(24).toString('hex');
  const shots = new Map(input.shots.map((s) => [s.name, s]));
  const keys = new Set(input.blocks.map((b) => b.sourceKey));
  let decide = () => {};
  const decision = new Promise((resolve2) => {
    decide = resolve2;
  });
  const handle = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!tokenOk(url.searchParams.get('token'), token)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      res.end(page(input, token));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/shot') {
      const shot = shots.get(url.searchParams.get('name') ?? '');
      if (!shot) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(await readFile4(shot.path));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/approve') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const evidence = typeof body.evidence === 'string' ? body.evidence.slice(0, 20000) : '';
      if (input.docket && !evidence.trim()) {
        res.writeHead(400, DONE_HEADERS).end('{"error":"evidence required"}');
        return;
      }
      res.writeHead(200, DONE_HEADERS).end('{"ok":true}');
      decide({
        approved: true,
        blocks: strings(body.blocks).filter((k) => keys.has(k)),
        shots: strings(body.shots).filter((n) => shots.has(n)),
        outcome: body.outcome === 'blocked' ? 'blocked' : 'complete',
        evidence,
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/cancel') {
      res.writeHead(200, DONE_HEADERS).end('{"ok":true}');
      decide({ approved: false, reason: 'cancelled' });
      return;
    }
    res.writeHead(404).end('not found');
  };
  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    });
  });
  await new Promise((resolve2, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve2);
  });
  const timer = setTimeout(
    () => decide({ approved: false, reason: 'timeout' }),
    input.timeoutMs ?? REVIEW_TIMEOUT_MS,
  );
  decision.then(() => {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/?token=${token}`, port, token, decision };
}

// src/store.ts
import {
  mkdir as mkdir5,
  readdir,
  readFile as readFile5,
  rm,
  stat,
  writeFile as writeFile4,
} from 'node:fs/promises';
import { homedir as homedir3 } from 'node:os';
import { join as join5 } from 'node:path';
function dataDir() {
  const home = process.env.PLAN_TIME_HOME;
  return home ? join5(home, 'data') : join5(homedir3(), '.local', 'share', 'plan-time');
}
async function ensureDir(path) {
  await mkdir5(path, { recursive: true, mode: 448 });
  return path;
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile5(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
async function writeJson(path, value) {
  await writeFile4(
    path,
    `${JSON.stringify(value, null, 2)}
`,
    { mode: 384 },
  );
}
async function listDir(path) {
  try {
    return (await readdir(path)).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
function outboxDir() {
  return join5(dataDir(), 'outbox');
}
async function addToOutbox(blocks) {
  const byDay = new Map();
  for (const block of blocks) {
    const day = block.startedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), block]);
  }
  const dir = await ensureDir(outboxDir());
  for (const [day, added] of byDay) {
    const path = join5(dir, `${day}.json`);
    const merged = new Map(((await readJson(path)) ?? []).map((b) => [b.sourceKey, b]));
    for (const block of added) merged.set(block.sourceKey, block);
    await writeJson(
      path,
      [...merged.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    );
  }
  return blocks.length;
}
async function readOutbox() {
  const out = [];
  for (const name of await listDir(outboxDir())) {
    if (name.endsWith('.json')) out.push(...((await readJson(join5(outboxDir(), name))) ?? []));
  }
  return out;
}
async function removeFromOutbox(blocks) {
  const gone = new Map(blocks.map((b) => [b.sourceKey, b.endedAt]));
  for (const name of await listDir(outboxDir())) {
    if (!name.endsWith('.json')) continue;
    const path = join5(outboxDir(), name);
    const kept = ((await readJson(path)) ?? []).filter((b) => gone.get(b.sourceKey) !== b.endedAt);
    if (kept.length === 0) await rm(path, { force: true });
    else await writeJson(path, kept);
  }
}
function sessionsDir() {
  return join5(dataDir(), 'sessions');
}
function sessionDir(id) {
  return join5(sessionsDir(), id);
}
function shotsDir(id) {
  return join5(sessionDir(id), 'shots');
}
function isPaused(session) {
  return session.pauses.some((p) => p.to === null);
}
async function openSession() {
  for (const id of await listDir(sessionsDir())) {
    const session = await readJson(join5(sessionDir(id), 'session.json'));
    if (session) return session;
  }
  return null;
}
async function saveSession(session) {
  await ensureDir(shotsDir(session.id));
  await writeJson(join5(sessionDir(session.id), 'session.json'), session);
}
async function deleteSession(id) {
  await rm(sessionDir(id), { recursive: true, force: true });
}
async function listShots(id) {
  const shots = [];
  for (const name of await listDir(shotsDir(id))) {
    if (!name.endsWith('.png')) continue;
    const path = join5(shotsDir(id), name);
    const info = await stat(path);
    shots.push({ name, path, bytes: info.size });
  }
  return shots;
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

// src/session.ts
var SHOT_INTERVAL_MS = 5 * 60000;
var FRONT_LOOKBACK_MS = 2 * 60000;
var AFK_LOOKBACK_MS = 10 * 60000;
var AFK_STALE_MS = 3 * 60000;
function latest(events) {
  return events.reduce(
    (best, e) => (!best || Date.parse(e.timestamp) > Date.parse(best.timestamp) ? e : best),
    null,
  );
}
function text2(value) {
  return typeof value === 'string' ? value : '';
}
async function frontStatus(aw, config, now) {
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
  const app = text2(front.data.app);
  let domain = null;
  if (isBrowser(app)) {
    const web = await Promise.all(
      buckets.filter((b) => isWebBucket(b.id)).map((b) => aw.events(b.id, since, now)),
    );
    const tab = latest(web.flat());
    domain = tab ? domainOf(text2(tab.data.url)) : null;
  }
  return isPrivate({ app, title: text2(front.data.title), domain }, config.private)
    ? 'private'
    : 'ok';
}
function shotName(at) {
  return `shot-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}.png`;
}
function shotTime(name) {
  const m = /^shot-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.png$/.exec(name);
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : NaN;
}
function screenshotter(deps) {
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
    const file = join6(shotsDir(session.id), shotName(now));
    try {
      await deps.capture(file);
    } catch (err) {
      disabled = true;
      await rm2(file, { force: true });
      deps.log(
        `screenshots are off for this run: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'unavailable';
    }
    return 'taken';
  };
}
async function startSession(deps, identifier, agent) {
  const open = await openSession();
  if (open) {
    throw new Error(
      `a session for ${open.identifier} is already open — finish or discard it first`,
    );
  }
  const issue = await deps.client.issue(identifier);
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
  const session = {
    id: `${issue.identifier}-${now.getTime()}-${randomBytes2(6).toString('hex')}`,
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
function activeWindow(session, end) {
  const out = [];
  let from = Date.parse(session.startedAt);
  for (const pause of session.pauses) {
    const at = Date.parse(pause.from);
    if (at > from) out.push({ start: from, end: Math.min(at, end.getTime()) });
    from = pause.to ? Date.parse(pause.to) : Infinity;
  }
  if (from < end.getTime()) out.push({ start: from, end: end.getTime() });
  return out;
}
function intersectLength(a, b) {
  let total = 0;
  for (const x of a) {
    for (const y of b) total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
  }
  return total;
}
async function buildDocket(aw, config, session, end) {
  const window = activeWindow(session, end);
  const total = window.reduce((sum, i) => sum + i.end - i.start, 0);
  const start = new Date(session.startedAt);
  const blocks = [];
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
function utc(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
function duration(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
function inert(value) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\`*_[\]()!<>|#~:]/g, '\\$&')
    .replace(/www\./gi, (m) => `${m.slice(0, 3)}\\.`)
    .replace(/@/g, '@​');
}
function blockMs(b) {
  return Date.parse(b.endedAt) - Date.parse(b.startedAt);
}
async function trimOutbox(device, window) {
  const overlapping = [];
  const pieces = [];
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
function docketMarkdown(docket, t) {
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
  const totals = new Map();
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
    const evidence = t.evidence
      .trim()
      .split(
        `
`,
      )
      .map((line) => (line.trim() ? inert(line) : ''));
    lines.push('', `### ${heading}`, '', ...evidence);
  }
  if (t.shots.length) {
    lines.push('', '### Screenshots', '');
    for (const shot of t.shots) lines.push(`![${inert(shot.name)}](${shot.url})`);
  }
  return `${lines.join(`
`)}
`;
}
var ATTACHMENT_URL = /^\/attachments\/[0-9a-f-]{36}\/raw$/i;
function embedUrl(url) {
  if (!ATTACHMENT_URL.test(url)) throw new Error(`unexpected attachment URL from Plan: ${url}`);
  return `/media${url}`;
}
async function approve(deps, config, session) {
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
  const attach = {
    endedAt: docket.endedAt,
    who,
    outcome: decision.outcome,
    evidence: decision.evidence,
    activeMs: docket.activeMs,
    idleMs: docket.idleMs,
    blocks: docket.blocks.filter((b) => keys.has(b.sourceKey)),
    shots: shots.filter((s) => ticked.has(s.name)).map((s) => s.name),
    uploaded: {},
    docketFile: null,
    docket: null,
    blocksSent: false,
    outboxTrimmed: false,
  };
  session.attach = attach;
  await saveSession(session);
  for (const shot of shots) if (!ticked.has(shot.name)) await rm2(shot.path, { force: true });
  return { decision, attach };
}
function docketFilename(session, endedAt) {
  return `docket-${session.identifier}-${endedAt.slice(0, 10)}.md`;
}
async function finishSession(deps, config, identifier, options) {
  const session = await openSession();
  if (!session || session.identifier.toUpperCase() !== identifier.trim().toUpperCase()) {
    throw new Error(`no open session for ${identifier} — run: plan-time status`);
  }
  let decision = null;
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
  const issue = { id: session.issueId, identifier: session.identifier };
  const step = async (done) => {
    done();
    await saveSession(session);
  };
  for (const name of attach.shots) {
    if (attach.uploaded[name]) continue;
    const bytes = await readFile6(join6(shotsDir(session.id), name));
    const uploaded = await deps.client.uploadAttachment(issue, name, 'image/png', bytes);
    await step(() => {
      attach.uploaded[name] = { id: uploaded.id, url: embedUrl(uploaded.url) };
    });
    deps.log(`attached ${name}`);
  }
  const docket = {
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
  if (typeof attach.docketFile !== 'string') {
    const file = await deps.client.uploadAttachment(
      issue,
      filename,
      'text/markdown',
      Buffer.from(markdown),
    );
    await step(() => (attach.docketFile = file.id));
    deps.log(`attached ${filename}`);
  }
  if (!attach.docket) {
    const stamped = await deps.client.createDocket(issue, {
      clientKey: session.id,
      outcome: attach.outcome,
      evidence: attach.evidence,
      body: markdown,
      device: config.device,
      sessionStartedAt: session.startedAt,
      sessionEndedAt: attach.endedAt,
      activeSeconds: Math.floor(attach.activeMs / 1000),
      attachmentIds: [...attach.shots.map((name) => attach.uploaded[name].id), attach.docketFile],
    });
    await step(() => (attach.docket = { id: stamped.id, number: stamped.number }));
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
    deps.log(
      `${session.identifier} stays open: docket ${attach.docket.number} records the blocker`,
    );
  } else {
    deps.log(`sent for review: ${attach.docket.number}`);
  }
  if (options.keep) deps.log(`session kept in ${shotsDir(session.id)}`);
  else await deleteSession(session.id);
  return { decision, sentShots: attach.shots, sentBlocks: attach.blocks.length };
}
async function pauseSession(paused, now) {
  const session = await openSession();
  if (!session) throw new Error('no open session');
  if (paused === isPaused(session)) return session;
  if (paused) session.pauses.push({ from: now.toISOString(), to: null });
  else session.pauses[session.pauses.length - 1].to = now.toISOString();
  await saveSession(session);
  return session;
}

// src/calls.ts
import { access as access2 } from 'node:fs/promises';
import { homedir as homedir4 } from 'node:os';
import { join as join7 } from 'node:path';

// src/sqlite.ts
import { execFile as execFile4 } from 'node:child_process';
import { promisify as promisify4 } from 'node:util';
var run4 = promisify4(execFile4);
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
  const { stdout: stdout2 } = await run4('sqlite3', ['-readonly', '-json', path, sql], {
    maxBuffer: 67108864,
  });
  return stdout2.trim() ? JSON.parse(stdout2) : [];
}

// src/calls.ts
var APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
var CALL_HISTORY_PATH = join7(
  homedir4(),
  'Library/Application Support/CallHistoryDB/CallHistory.storedata',
);
var ADDRESS_BOOK_DIR = join7(homedir4(), 'Library/Application Support/AddressBook');
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
  const { readdir: readdir2 } = await import('node:fs/promises');
  const paths = [];
  const main = join7(ADDRESS_BOOK_DIR, 'AddressBook-v22.abcddb');
  await access2(main)
    .then(() => paths.push(main))
    .catch(() => {});
  const sources = join7(ADDRESS_BOOK_DIR, 'Sources');
  const entries = await readdir2(sources).catch(() => []);
  for (const entry of entries) {
    const path = join7(sources, entry, 'AddressBook-v22.abcddb');
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
function describe(block) {
  const minutes2 = Math.round((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60000);
  return (
    `${block.startedAt.slice(0, 16)} ${String(minutes2).padStart(4)}m ${block.app}` +
    `${block.domain ? ` (${block.domain})` : ''} — ${block.title}`
  );
}
async function sync(config, apiKey, options) {
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
async function reviewOutbox(config, client, options) {
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

// src/cli.ts
var WATCH_INTERVAL_MS = 15 * 60000;
var USAGE = `plan-time ${VERSION} — records your activity as time blocks and sends to Plan
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
var FLAGS = new Set(['--calls', '--dry-run', '--keep', '--yes']);
var SKIPPED = {
  afk: 'you are away',
  private: 'a private app, title or site is in front',
  unknown: 'ActivityWatch cannot say what is in front or whether you are away',
};
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
  const apiKey = dryRun ? null : await requireApiKey();
  await sync(config, apiKey, { calls: flags.has('--calls'), dryRun, log });
}
function stopSignal() {
  const stopped = new AbortController();
  const stop = () => {
    log('stopping');
    stopped.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return stopped.signal;
}
function errorText(err) {
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
async function watch(flags) {
  await requireConfig();
  const apiKey = await requireApiKey();
  const signal = stopSignal();
  const shoot = shooter();
  let lastSync = 0;
  log(
    `reading activity every ${WATCH_INTERVAL_MS / 60000} minutes; nothing is sent until you run: plan-time review`,
  );
  while (!signal.aborted) {
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
    await sleep2(SHOT_INTERVAL_MS, undefined, { signal }).catch(() => {});
  }
}
function openUrl(url) {
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
async function confirm(question) {
  return /^y(es)?$/i.test(await ask(question));
}
async function sessionDeps() {
  const config = await requireConfig();
  const client = new PlanClient(config.url, await requireApiKey());
  const deps = {
    client,
    aw: new ActivityWatch(),
    now: () => new Date(),
    confirm,
    openUrl,
    log,
  };
  return { config, deps };
}
async function review(flags) {
  const config = await requireConfig();
  const client = new PlanClient(config.url, await requireApiKey());
  await reviewOutbox(config, client, {
    yes: flags.has('--yes'),
    log,
    openUrl,
    confirm: process.stdin.isTTY ? confirm : undefined,
  });
}
async function start(identifier, agent) {
  if (!identifier) throw new Error('usage: plan-time start <TICKET> [--agent <name>]');
  const { deps } = await sessionDeps();
  await startSession(deps, identifier, agent);
  const signal = stopSignal();
  const shoot = shooter();
  log(
    `a screenshot every ${SHOT_INTERVAL_MS / 60000} minutes, kept on this computer, ` +
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
    await sleep2(SHOT_INTERVAL_MS, undefined, { signal }).catch(() => {});
  }
}
async function finish(identifier, flags) {
  if (!identifier) throw new Error('usage: plan-time finish <TICKET> [--keep]');
  const { config, deps } = await sessionDeps();
  await finishSession(deps, config, identifier, { keep: flags.has('--keep') });
}
async function discard() {
  const session = await openSession();
  if (!session) throw new Error('no open session');
  await deleteSession(session.id);
  log(`discarded the session for ${session.identifier}; nothing was sent`);
}
async function sent() {
  const text3 = await readSentLog();
  if (!text3) log(`nothing sent yet (${sentLogPath()})`);
  else process.stdout.write(text3);
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
  const flags = new Set();
  const args = [];
  let agent = null;
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
      throw new Error(`unknown command ${command}

${USAGE}`);
  }
}
main(process.argv.slice(2)).catch((err) => {
  console.error(`[plan-time] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
