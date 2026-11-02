import {
  db,
  initiative,
  issue,
  issueWorklog,
  project,
  readSecret,
  rizeClientMap,
  rizeTimeEntry,
  user,
  writeSecret,
  getSetting,
  setSetting,
} from '@repo/db';
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { fetchTimeEntries, type RizeEntry } from './client';
import { issueRefs, timeState, type TimeState } from './match';

const SECRET_KEY = 'rize';
const STATE_KEY = 'rize';

interface RizeSecret {
  apiKey: string;
}

export interface RizeStatus {
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  entries: number;
}

export async function getRizeStatus(): Promise<RizeStatus> {
  const secret = await readSecret<RizeSecret>(SECRET_KEY);
  const state = await getSetting<{ lastSyncAt?: string; lastError?: string | null }>(STATE_KEY);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(rizeTimeEntry);
  return {
    configured: !!secret?.apiKey,
    lastSyncAt: state?.lastSyncAt ?? null,
    lastError: state?.lastError ?? null,
    entries: count?.n ?? 0,
  };
}

// Stores the key encrypted. An empty key disconnects; the entries already copied stay.
export async function setRizeKey(apiKey: string): Promise<RizeStatus> {
  const key = apiKey.trim();
  await writeSecret(SECRET_KEY, { apiKey: key }, { configured: key !== '' });
  return getRizeStatus();
}

const DAY = 86_400_000;

// Copies the time entries that started in the last `days` days, matches each to a
// person, an issue and a client, and keeps one worklog per matched entry. An entry
// gone from Rize inside the window is removed with its worklog.
export async function syncRize(days: number): Promise<{ synced: number; matched: number }> {
  const secret = await readSecret<RizeSecret>(SECRET_KEY);
  if (!secret?.apiKey) throw new HttpError(409, 'Rize is not connected');
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY);
  try {
    const entries = await fetchTimeEntries(secret.apiKey, from, to);
    const matched = await storeEntries(entries, from);
    await setSetting(STATE_KEY, { lastSyncAt: new Date().toISOString(), lastError: null });
    return { synced: entries.length, matched };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setSetting(STATE_KEY, { lastSyncAt: new Date().toISOString(), lastError: message });
    throw error;
  }
}

// The sync the background loop runs: the last 3 days, the first time the last 60.
export async function syncRizeIfConnected(): Promise<void> {
  const status = await getRizeStatus();
  if (!status.configured) return;
  await syncRize(status.entries === 0 ? 60 : 3);
}

async function storeEntries(entries: RizeEntry[], windowStart: Date): Promise<number> {
  const users = new Map(
    (await db.select({ id: user.id, email: user.email }).from(user)).map((u) => [
      u.email.toLowerCase(),
      u.id,
    ]),
  );
  const clients = new Map(
    (await db.select().from(rizeClientMap)).map((c) => [
      c.rizeClient.toLowerCase(),
      c.initiativeId,
    ]),
  );
  let matched = 0;
  for (const e of entries) {
    const [existing] = await db
      .select({
        id: rizeTimeEntry.id,
        matchSource: rizeTimeEntry.matchSource,
        issueId: rizeTimeEntry.issueId,
      })
      .from(rizeTimeEntry)
      .where(eq(rizeTimeEntry.rizeId, e.id));
    const manual = existing?.matchSource === 'manual';
    const found = manual ? null : await findIssue(e);
    const issueId = manual ? existing!.issueId : (found?.id ?? null);
    const initiativeId =
      (manual && issueId ? await initiativeOf(issueId) : found?.initiativeId) ??
      (e.clientName ? (clients.get(e.clientName.toLowerCase()) ?? null) : null);
    const values = {
      rizeId: e.id,
      memberEmail: e.memberEmail,
      startedAt: new Date(e.startedAt),
      endedAt: e.endedAt ? new Date(e.endedAt) : null,
      seconds: e.seconds,
      title: e.title,
      clientName: e.clientName,
      projectName: e.projectName,
      taskName: e.taskName,
      userId: e.memberEmail ? (users.get(e.memberEmail) ?? null) : null,
      issueId,
      initiativeId,
      matchSource: manual ? 'manual' : issueId ? 'auto' : 'none',
      syncedAt: new Date(),
    };
    const [row] = await db
      .insert(rizeTimeEntry)
      .values(values)
      .onConflictDoUpdate({ target: rizeTimeEntry.rizeId, set: values })
      .returning({ id: rizeTimeEntry.id });
    await syncWorklog(row!.id);
    if (issueId) matched++;
  }
  // Entries Rize no longer has, inside the window just read.
  const seen = entries.map((e) => e.id);
  await db
    .delete(rizeTimeEntry)
    .where(
      and(
        gte(rizeTimeEntry.startedAt, windowStart),
        seen.length ? notInArray(rizeTimeEntry.rizeId, seen) : sql`true`,
      ),
    );
  return matched;
}

// The issue an entry's titles name, the first that exists.
async function findIssue(
  e: RizeEntry,
): Promise<{ id: number; initiativeId: number | null } | null> {
  for (const ref of issueRefs(e.taskName, e.title, e.projectName)) {
    const [row] = await db
      .select({ id: issue.id, initiativeId: issue.initiativeId })
      .from(issue)
      .innerJoin(project, eq(project.id, issue.projectId))
      .where(and(eq(project.key, ref.key), eq(issue.sequenceNumber, ref.sequenceNumber)));
    if (row) return row;
  }
  return null;
}

async function initiativeOf(issueId: number): Promise<number | null> {
  const [row] = await db
    .select({ initiativeId: issue.initiativeId })
    .from(issue)
    .where(eq(issue.id, issueId));
  return row?.initiativeId ?? null;
}

// Keeps the worklog of an entry in step with it: one row while the entry has an issue,
// a person and at least a minute, none otherwise.
async function syncWorklog(entryId: number): Promise<void> {
  const [e] = await db.select().from(rizeTimeEntry).where(eq(rizeTimeEntry.id, entryId));
  const minutes = e ? Math.round(e.seconds / 60) : 0;
  if (!e || !e.issueId || !e.userId || minutes < 1) {
    await db.delete(issueWorklog).where(eq(issueWorklog.rizeEntryId, entryId));
    return;
  }
  const values = {
    issueId: e.issueId,
    userId: e.userId,
    minutes,
    spentOn: e.startedAt.toISOString().slice(0, 10),
    note: `Rize: ${e.taskName ?? e.title}`.slice(0, 500),
    rizeEntryId: entryId,
  };
  await db
    .insert(issueWorklog)
    .values(values)
    .onConflictDoUpdate({ target: issueWorklog.rizeEntryId, set: values });
}

// Ties an entry to an issue by hand. A manual link is kept on later syncs.
export async function linkEntry(entryId: number, issueId: number | null): Promise<void> {
  const [e] = await db
    .select({ id: rizeTimeEntry.id })
    .from(rizeTimeEntry)
    .where(eq(rizeTimeEntry.id, entryId));
  if (!e) throw new HttpError(404, 'Time entry not found');
  await db
    .update(rizeTimeEntry)
    .set({
      issueId,
      initiativeId: issueId ? await initiativeOf(issueId) : null,
      matchSource: issueId ? 'manual' : 'none',
    })
    .where(eq(rizeTimeEntry.id, entryId));
  await syncWorklog(entryId);
}

// Points a Rize client at a client initiative, and re-attributes its entries that are
// not tied to an issue.
export async function mapClient(rizeClient: string, initiativeId: number | null): Promise<void> {
  if (initiativeId == null) {
    await db.delete(rizeClientMap).where(eq(rizeClientMap.rizeClient, rizeClient));
  } else {
    await db
      .insert(rizeClientMap)
      .values({ rizeClient, initiativeId })
      .onConflictDoUpdate({ target: rizeClientMap.rizeClient, set: { initiativeId } });
  }
  await db
    .update(rizeTimeEntry)
    .set({ initiativeId })
    .where(and(eq(rizeTimeEntry.clientName, rizeClient), isNull(rizeTimeEntry.issueId)));
}

function monthWindow(month: string): [Date, Date] {
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'month must be YYYY-MM');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return [start, end];
}

export interface ClientTime {
  initiativeId: number;
  title: string;
  trackedMinutes: number;
  limitMinutes: number | null;
  state: TimeState;
}

export interface UnmatchedEntry {
  id: number;
  memberEmail: string | null;
  startedAt: string;
  minutes: number;
  title: string;
  clientName: string | null;
  projectName: string | null;
  taskName: string | null;
  initiativeId: number | null;
}

export interface TimeOverview {
  month: string;
  clients: ClientTime[];
  trackedMinutes: number;
  matchedMinutes: number;
  unmatched: UnmatchedEntry[];
  rizeClients: { name: string; initiativeId: number | null }[];
}

// A project's month of tracked time: each client initiative against its limit, and the
// entries not yet tied to a ticket.
export async function getTimeOverview(projectId: number, month: string): Promise<TimeOverview> {
  const [start, end] = monthWindow(month);
  const inMonth = and(gte(rizeTimeEntry.startedAt, start), lt(rizeTimeEntry.startedAt, end));
  const initiatives = await db
    .select({
      id: initiative.id,
      title: initiative.title,
      monthlyMinutes: initiative.monthlyMinutes,
    })
    .from(initiative)
    .where(eq(initiative.projectId, projectId))
    .orderBy(asc(initiative.title));
  const ids = initiatives.map((i) => i.id);
  const sums = ids.length
    ? await db
        .select({
          initiativeId: rizeTimeEntry.initiativeId,
          seconds: sql<number>`coalesce(sum(${rizeTimeEntry.seconds}), 0)::int`,
        })
        .from(rizeTimeEntry)
        .where(and(inMonth, inArray(rizeTimeEntry.initiativeId, ids)))
        .groupBy(rizeTimeEntry.initiativeId)
    : [];
  const tracked = new Map(sums.map((s) => [s.initiativeId, Math.round(s.seconds / 60)]));
  const [totals] = await db
    .select({
      all: sql<number>`coalesce(sum(${rizeTimeEntry.seconds}), 0)::int`,
      matched: sql<number>`coalesce(sum(${rizeTimeEntry.seconds}) filter (where ${rizeTimeEntry.issueId} is not null), 0)::int`,
    })
    .from(rizeTimeEntry)
    .where(inMonth);
  const unmatched = await db
    .select()
    .from(rizeTimeEntry)
    .where(and(inMonth, isNull(rizeTimeEntry.issueId)))
    .orderBy(desc(rizeTimeEntry.seconds))
    .limit(200);
  const clientRows = await db
    .selectDistinct({ name: rizeTimeEntry.clientName })
    .from(rizeTimeEntry)
    .where(sql`${rizeTimeEntry.clientName} is not null`);
  const mapped = new Map(
    (await db.select().from(rizeClientMap)).map((m) => [m.rizeClient, m.initiativeId]),
  );
  return {
    month,
    clients: initiatives
      .filter((i) => tracked.has(i.id) || i.monthlyMinutes)
      .map((i) => {
        const minutes = tracked.get(i.id) ?? 0;
        return {
          initiativeId: i.id,
          title: i.title,
          trackedMinutes: minutes,
          limitMinutes: i.monthlyMinutes,
          state: timeState(minutes, i.monthlyMinutes),
        };
      }),
    trackedMinutes: Math.round((totals?.all ?? 0) / 60),
    matchedMinutes: Math.round((totals?.matched ?? 0) / 60),
    unmatched: unmatched.map((u) => ({
      id: u.id,
      memberEmail: u.memberEmail,
      startedAt: iso(u.startedAt),
      minutes: Math.round(u.seconds / 60),
      title: u.title,
      clientName: u.clientName,
      projectName: u.projectName,
      taskName: u.taskName,
      initiativeId: u.initiativeId,
    })),
    rizeClients: clientRows
      .map((c) => ({ name: c.name!, initiativeId: mapped.get(c.name!) ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// The minutes tracked this calendar month per initiative, for the Playbook.
export async function trackedThisMonth(initiativeIds: number[]): Promise<Map<number, number>> {
  if (initiativeIds.length === 0) return new Map();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({
      initiativeId: rizeTimeEntry.initiativeId,
      seconds: sql<number>`coalesce(sum(${rizeTimeEntry.seconds}), 0)::int`,
    })
    .from(rizeTimeEntry)
    .where(
      and(gte(rizeTimeEntry.startedAt, start), inArray(rizeTimeEntry.initiativeId, initiativeIds)),
    )
    .groupBy(rizeTimeEntry.initiativeId);
  return new Map(rows.map((r) => [r.initiativeId!, Math.round(r.seconds / 60)]));
}
