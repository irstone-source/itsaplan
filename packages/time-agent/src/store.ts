import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Block } from './transform';

// What waits on this machine for the person's approval: blocks in the outbox, and the open
// work session with its screenshots.

export function dataDir(): string {
  const home = process.env.PLAN_TIME_HOME;
  return home ? join(home, 'data') : join(homedir(), '.local', 'share', 'plan-time');
}

async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  return path;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function listDir(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function outboxDir(): string {
  return join(dataDir(), 'outbox');
}

// One file per day of the block's start; a block's key fixes its start minute, so a block
// that grew since the last sync replaces its earlier copy in the same file.
export async function addToOutbox(blocks: Block[]): Promise<number> {
  const byDay = new Map<string, Block[]>();
  for (const block of blocks) {
    const day = block.startedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), block]);
  }
  const dir = await ensureDir(outboxDir());
  for (const [day, added] of byDay) {
    const path = join(dir, `${day}.json`);
    const merged = new Map(((await readJson<Block[]>(path)) ?? []).map((b) => [b.sourceKey, b]));
    for (const block of added) merged.set(block.sourceKey, block);
    await writeJson(
      path,
      [...merged.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    );
  }
  return blocks.length;
}

export async function readOutbox(): Promise<Block[]> {
  const out: Block[] = [];
  for (const name of await listDir(outboxDir())) {
    if (name.endsWith('.json'))
      out.push(...((await readJson<Block[]>(join(outboxDir(), name))) ?? []));
  }
  return out;
}

// Removes the given blocks only while they are unchanged: a block that a concurrent sync
// extended since it was read stays for the next review.
export async function removeFromOutbox(blocks: Block[]): Promise<void> {
  const gone = new Map(blocks.map((b) => [b.sourceKey, b.endedAt]));
  for (const name of await listDir(outboxDir())) {
    if (!name.endsWith('.json')) continue;
    const path = join(outboxDir(), name);
    const kept = ((await readJson<Block[]>(path)) ?? []).filter(
      (b) => gone.get(b.sourceKey) !== b.endedAt,
    );
    if (kept.length === 0) await rm(path, { force: true });
    else await writeJson(path, kept);
  }
}

export interface Session {
  id: string;
  identifier: string;
  issueId: number;
  projectId: number;
  title: string;
  agent: string | null;
  startedAt: string;
  // Each pause; `to` is null while the session is paused.
  pauses: Array<{ from: string; to: string | null }>;
  // Set once the person approves the docket. Each step is recorded as it completes, so a
  // `finish` run again after a failure resumes instead of uploading twice.
  attach?: Attach;
}

export interface Attach {
  endedAt: string;
  who: string;
  // 'complete' with the evidence it is done, or 'blocked' with the blocker.
  outcome: 'complete' | 'blocked';
  evidence: string;
  activeMs: number;
  idleMs: number;
  // The ticked blocks and screenshot names.
  blocks: Block[];
  shots: string[];
  // Screenshot name → the URL it is embedded by.
  uploaded: Record<string, { id: string; url: string }>;
  // The publicId of the uploaded docket markdown.
  docketFile: string | null;
  // The stamped docket Plan made from the session.
  docket: { id: number; number: string } | null;
  blocksSent: boolean;
  outboxTrimmed: boolean;
}

function sessionsDir(): string {
  return join(dataDir(), 'sessions');
}

export function sessionDir(id: string): string {
  return join(sessionsDir(), id);
}

export function shotsDir(id: string): string {
  return join(sessionDir(id), 'shots');
}

export function isPaused(session: Session): boolean {
  return session.pauses.some((p) => p.to === null);
}

export async function openSession(): Promise<Session | null> {
  for (const id of await listDir(sessionsDir())) {
    const session = await readJson<Session>(join(sessionDir(id), 'session.json'));
    if (session) return session;
  }
  return null;
}

export async function saveSession(session: Session): Promise<void> {
  await ensureDir(shotsDir(session.id));
  await writeJson(join(sessionDir(session.id), 'session.json'), session);
}

export async function deleteSession(id: string): Promise<void> {
  await rm(sessionDir(id), { recursive: true, force: true });
}

export interface Shot {
  name: string;
  path: string;
  bytes: number;
}

export async function listShots(id: string): Promise<Shot[]> {
  const shots: Shot[] = [];
  for (const name of await listDir(shotsDir(id))) {
    if (!name.endsWith('.png')) continue;
    const path = join(shotsDir(id), name);
    const info = await stat(path);
    shots.push({ name, path, bytes: info.size });
  }
  return shots;
}
