import { createHash } from 'node:crypto';

// Turns raw ActivityWatch events into the blocks Plan receives. Everything here is a pure
// function of its inputs so it can be tested with fixture events.

export interface AwEvent {
  timestamp: string;
  // Seconds.
  duration: number;
  data: Record<string, unknown>;
}

export interface PrivateList {
  apps: string[];
  domains: string[];
  titles: string[];
}

export interface Block {
  sourceKey: string;
  source: 'activity' | 'call';
  startedAt: string;
  endedAt: string;
  app: string;
  title: string;
  domain: string | null;
  detail?: Record<string, unknown>;
}

// A block before it is keyed and serialised. Times are epoch milliseconds.
export interface Piece {
  start: number;
  end: number;
  app: string;
  title: string;
  domain: string | null;
}

interface Interval {
  start: number;
  end: number;
}

export const MERGE_GAP_MS = 60_000;
export const MIN_BLOCK_MS = 120_000;
export const MAX_BLOCK_MS = 3 * 60 * 60_000;

const BROWSER_WORDS = new Set([
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

export function isBrowser(app: string): boolean {
  return app
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => BROWSER_WORDS.has(word));
}

function intervalOf(event: AwEvent): Interval {
  const start = Date.parse(event.timestamp);
  return { start, end: start + Math.max(0, event.duration) * 1000 };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function piecesOf(windowEvents: AwEvent[]): Piece[] {
  const pieces: Piece[] = [];
  for (const event of windowEvents) {
    const app = text(event.data.app);
    const { start, end } = intervalOf(event);
    if (!app || !Number.isFinite(start) || end <= start) continue;
    pieces.push({ start, end, app, title: text(event.data.title), domain: null });
  }
  return pieces;
}

// Sorted, overlapping intervals joined.
function coalesce(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else out.push({ ...interval });
  }
  return out;
}

export function notAfkIntervals(afkEvents: AwEvent[]): Interval[] {
  return coalesce(afkEvents.filter((e) => e.data.status === 'not-afk').map(intervalOf));
}

// Each piece is cut to the parts that fall inside an interval; a piece that spans an AFK
// gap becomes two.
export function clipToIntervals(pieces: Piece[], intervals: Interval[]): Piece[] {
  const out: Piece[] = [];
  for (const piece of pieces) {
    for (const interval of intervals) {
      const start = Math.max(piece.start, interval.start);
      const end = Math.min(piece.end, interval.end);
      if (end > start) out.push({ ...piece, start, end });
    }
  }
  return out;
}

export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

// A browser window gets the domain of the web event that overlaps it the most.
export function attachDomains(pieces: Piece[], webEvents: AwEvent[]): Piece[] {
  const tabs = webEvents
    .map((event) => ({ ...intervalOf(event), domain: domainOf(text(event.data.url)) }))
    .filter((tab) => tab.domain !== null);
  return pieces.map((piece) => {
    if (!isBrowser(piece.app)) return piece;
    let best: { domain: string | null; overlap: number } = { domain: null, overlap: 0 };
    for (const tab of tabs) {
      const overlap = Math.min(piece.end, tab.end) - Math.max(piece.start, tab.start);
      if (overlap > best.overlap) best = { domain: tab.domain, overlap };
    }
    return { ...piece, domain: best.domain };
  });
}

function sameActivity(a: Piece, b: Piece): boolean {
  return a.app === b.app && a.title === b.title && a.domain === b.domain;
}

export function mergePieces(pieces: Piece[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
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

export function splitLong(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
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

export function dropShort(pieces: Piece[]): Piece[] {
  return pieces.filter((piece) => piece.end - piece.start >= MIN_BLOCK_MS);
}

function lower(values: string[]): string[] {
  return values.map((v) => v.trim().toLowerCase()).filter(Boolean);
}

// Windows reports an app as its executable, "1Password.exe".
function appName(app: string): string {
  return app
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, '');
}

export function isPrivate(
  piece: Pick<Piece, 'app' | 'title' | 'domain'>,
  list: PrivateList,
): boolean {
  const app = appName(piece.app);
  const title = piece.title.toLowerCase();
  const domain = piece.domain?.toLowerCase() ?? null;
  if (list.apps.some((a) => appName(a) === app)) return true;
  if (lower(list.titles).some((word) => title.includes(word))) return true;
  if (domain && lower(list.domains).some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  return false;
}

export function applyPrivate<T extends Pick<Piece, 'app' | 'title' | 'domain'>>(
  pieces: T[],
  list: PrivateList,
): T[] {
  return pieces.filter((piece) => !isPrivate(piece, list));
}

export function startMinuteIso(ms: number): string {
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

export function sourceKeyOf(device: string, app: string, title: string, startMs: number): string {
  return createHash('sha256')
    .update([device, app, title, startMinuteIso(startMs)].join('|'))
    .digest('hex');
}

export function blockOf(
  device: string,
  piece: Piece,
  source: Block['source'] = 'activity',
  detail?: Record<string, unknown>,
): Block {
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

export interface BuildInput {
  device: string;
  windowEvents: AwEvent[];
  // null when the machine has no AFK watcher; nothing is clipped then.
  afkEvents: AwEvent[] | null;
  webEvents: AwEvent[];
  privateList: PrivateList;
}

export function buildBlocks(input: BuildInput): Block[] {
  let pieces = piecesOf(input.windowEvents);
  if (input.afkEvents) pieces = clipToIntervals(pieces, notAfkIntervals(input.afkEvents));
  pieces = attachDomains(pieces, input.webEvents);
  pieces = dropShort(splitLong(mergePieces(pieces)));
  pieces = applyPrivate(pieces, input.privateList);
  return pieces.map((piece) => blockOf(input.device, piece));
}
