import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Shot } from './store';
import type { Block } from './transform';

// The page on which the person decides what leaves the machine. It is served on 127.0.0.1
// only, and every request must carry the token printed with the URL, so another local
// program or a web page cannot read the screenshots or approve on the person's behalf.

export const REVIEW_TIMEOUT_MS = 30 * 60_000;
const MAX_BODY_BYTES = 1024 * 1024;
const DONE_HEADERS = { 'content-type': 'application/json', connection: 'close' };

export interface DocketInfo {
  identifier: string;
  filename: string;
  // Size of the docket markdown with every block and no evidence text.
  baseBytes: number;
}

export interface ReviewInput {
  heading: string;
  blocks: Block[];
  shots: Shot[];
  // Set for a work-session docket; absent for outbox blocks.
  docket?: DocketInfo;
  timeoutMs?: number;
}

export type Outcome = 'complete' | 'blocked';

export type Decision =
  | { approved: false; reason: 'cancelled' | 'timeout' }
  | { approved: true; blocks: string[]; shots: string[]; outcome: Outcome; evidence: string };

export interface Review {
  url: string;
  port: number;
  token: string;
  decision: Promise<Decision>;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

function minutes(block: Block): number {
  return Math.round((Date.parse(block.endedAt) - Date.parse(block.startedAt)) / 60_000);
}

function page(input: ReviewInput, token: string): string {
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
    items.push('a comment on ' + DATA.docket.identifier + ' with the same docket');
  }
  const blocks = ticked('block').length;
  items.push(blocks + ' time block' + (blocks === 1 ? '' : 's') + (DATA.docket ? ', logged against ' + DATA.docket.identifier : ''));
  if (DATA.docket && outcome() === 'blocked') items.push(DATA.docket.identifier + ' stays open: you will not be asked to complete it');
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

function tokenOk(given: string | null, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function startReview(input: ReviewInput): Promise<Review> {
  const token = randomBytes(24).toString('hex');
  const shots = new Map(input.shots.map((s) => [s.name, s]));
  const keys = new Set(input.blocks.map((b) => b.sourceKey));
  let decide: (d: Decision) => void = () => {};
  const decision = new Promise<Decision>((resolve) => {
    decide = resolve;
  });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
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
      res.end(await readFile(shot.path));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/approve') {
      const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
      const evidence = typeof body.evidence === 'string' ? body.evidence.slice(0, 20_000) : '';
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
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const timer = setTimeout(
    () => decide({ approved: false, reason: 'timeout' }),
    input.timeoutMs ?? REVIEW_TIMEOUT_MS,
  );
  void decision.then(() => {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/?token=${token}`, port, token, decision };
}
