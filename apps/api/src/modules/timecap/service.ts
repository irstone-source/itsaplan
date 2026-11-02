import {
  db,
  initiative,
  initiativeLabel,
  issue,
  issueStatus,
  issueWorklog,
  label,
  project,
  projectMember,
  timeBlock,
  timeDevice,
  timeRule,
} from '@repo/db';
import { and, asc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { assertPermission, getProjectAccess, type AuthUser } from '#shared/access';
import { listColumns } from '#modules/columns/service';
import { createIssue, getIssueBySequence } from '#modules/issues/service';
import { listAllMembers } from '#modules/members/service';
import { getProjectByRef } from '#modules/projects/service';
import { londonDate, londonDayRange, londonWeekStart } from './london';
import {
  callContact,
  distinctiveWord,
  suggest,
  ticketRef,
  type BlockFacts,
  type ClientInitiative,
  type RuleFacts,
  type Stretch,
  type Suggestion,
  type SuggestionContext,
  type Ticket,
} from './suggest';

type BlockRow = typeof timeBlock.$inferSelect;
type DeviceRow = typeof timeDevice.$inferSelect;
type RuleRow = typeof timeRule.$inferSelect;

export interface IssueRef {
  id: number;
  identifier: string;
  title: string;
  projectKey: string;
}

export interface InitiativeRef {
  id: number;
  title: string;
}

export interface TimeBlockDto {
  id: number;
  device: string;
  source: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
  app: string;
  title: string;
  domain: string | null;
  detail: Record<string, unknown>;
  status: string;
  issue: IssueRef | null;
  initiative: InitiativeRef | null;
  suggestion: {
    issue: IssueRef | null;
    initiative: InitiativeRef | null;
    confidence: number;
    reason: string;
  } | null;
  locked: boolean;
}

export interface DeviceDto {
  name: string;
  platform: string;
  agentVersion: string | null;
  trackerOk: boolean;
  lastSeenAt: string;
}

export interface TimeRuleDto {
  id: number;
  personal: boolean;
  field: string;
  pattern: string;
  issue: IssueRef | null;
  initiative: InitiativeRef | null;
  ignore: boolean;
  hits: number;
}

// "Confirm suggested" takes a pending block at this confidence or above.
export const CONFIDENT = 85;
const DAY_MS = 86_400_000;

const isGod = (user: AuthUser) => user.role === 'god';

// ── References ─────────────────────────────────────────────────────────────

interface Refs {
  issues: Map<number, IssueRef>;
  initiatives: Map<number, InitiativeRef>;
}

async function loadRefs(
  issueIds: (number | null)[],
  initiativeIds: (number | null)[],
): Promise<Refs> {
  const iids = [...new Set(issueIds.filter((id): id is number => id != null))];
  const nids = [...new Set(initiativeIds.filter((id): id is number => id != null))];
  const issues = iids.length
    ? await db
        .select({
          id: issue.id,
          sequenceNumber: issue.sequenceNumber,
          title: issue.title,
          projectKey: project.key,
        })
        .from(issue)
        .innerJoin(project, eq(project.id, issue.projectId))
        .where(inArray(issue.id, iids))
    : [];
  const initiatives = nids.length
    ? await db
        .select({ id: initiative.id, title: initiative.title })
        .from(initiative)
        .where(inArray(initiative.id, nids))
    : [];
  return {
    issues: new Map(
      issues.map((i) => [
        i.id,
        {
          id: i.id,
          identifier: `${i.projectKey}-${i.sequenceNumber}`,
          title: i.title,
          projectKey: i.projectKey,
        },
      ]),
    ),
    initiatives: new Map(initiatives.map((i) => [i.id, i])),
  };
}

async function blockRefs(rows: BlockRow[]): Promise<Refs> {
  return loadRefs(
    rows.flatMap((r) => [r.issueId, r.suggestedIssueId]),
    rows.flatMap((r) => [r.initiativeId, r.suggestedInitiativeId]),
  );
}

function toBlockDto(row: BlockRow, refs: Refs, weekStart: Date, user: AuthUser): TimeBlockDto {
  const suggested = row.suggestedIssueId != null || row.suggestedInitiativeId != null;
  return {
    id: row.id,
    device: row.device,
    source: row.source,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    seconds: row.seconds,
    app: row.app,
    title: row.title,
    domain: row.domain,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    status: row.status,
    issue: row.issueId != null ? (refs.issues.get(row.issueId) ?? null) : null,
    initiative: row.initiativeId != null ? (refs.initiatives.get(row.initiativeId) ?? null) : null,
    suggestion: suggested
      ? {
          issue:
            row.suggestedIssueId != null ? (refs.issues.get(row.suggestedIssueId) ?? null) : null,
          initiative:
            row.suggestedInitiativeId != null
              ? (refs.initiatives.get(row.suggestedInitiativeId) ?? null)
              : null,
          confidence: row.confidence,
          reason: row.reason,
        }
      : null,
    locked: isLocked(row, weekStart, user),
  };
}

async function blockDto(row: BlockRow, user: AuthUser): Promise<TimeBlockDto> {
  return toBlockDto(row, await blockRefs([row]), londonWeekStart(new Date()), user);
}

function toDeviceDto(row: DeviceRow): DeviceDto {
  return {
    name: row.name,
    platform: row.platform,
    agentVersion: row.agentVersion,
    trackerOk: row.trackerOk,
    lastSeenAt: iso(row.lastSeenAt),
  };
}

async function toRuleDtos(rows: RuleRow[]): Promise<TimeRuleDto[]> {
  const refs = await loadRefs(
    rows.map((r) => r.issueId),
    rows.map((r) => r.initiativeId),
  );
  return rows.map((r) => ({
    id: r.id,
    personal: r.userId !== null,
    field: r.field,
    pattern: r.pattern,
    issue: r.issueId != null ? (refs.issues.get(r.issueId) ?? null) : null,
    initiative: r.initiativeId != null ? (refs.initiatives.get(r.initiativeId) ?? null) : null,
    ignore: r.ignore,
    hits: r.hits,
  }));
}

// ── Lock and ownership ─────────────────────────────────────────────────────

// A block of a day before the current week's Monday is read-only to its person.
function isLocked(row: BlockRow, weekStart: Date, user: AuthUser): boolean {
  return row.startedAt < weekStart && !isGod(user);
}

function assertUnlocked(row: BlockRow, user: AuthUser): void {
  if (isLocked(row, londonWeekStart(new Date()), user)) {
    throw new HttpError(403, 'The week of this block has closed');
  }
}

// Another person's block is 404, so the routes say nothing about it.
async function ownBlock(userId: string, blockId: number): Promise<BlockRow> {
  const [row] = await db
    .select()
    .from(timeBlock)
    .where(and(eq(timeBlock.id, blockId), eq(timeBlock.userId, userId)));
  if (!row) throw new HttpError(404, 'Time block not found');
  return row;
}

// ── Devices ────────────────────────────────────────────────────────────────

export async function heartbeat(
  userId: string,
  input: { device: string; platform: string; version: string; awOk: boolean },
): Promise<DeviceDto> {
  const values = {
    userId,
    name: input.device,
    platform: input.platform,
    agentVersion: input.version,
    trackerOk: input.awOk,
    lastSeenAt: new Date(),
  };
  const [row] = await db
    .insert(timeDevice)
    .values(values)
    .onConflictDoUpdate({ target: [timeDevice.userId, timeDevice.name], set: values })
    .returning();
  return toDeviceDto(row!);
}

async function listDevices(userIds: string[]): Promise<Map<string, DeviceDto[]>> {
  const devices = new Map<string, DeviceDto[]>();
  if (userIds.length === 0) return devices;
  const rows = await db
    .select()
    .from(timeDevice)
    .where(inArray(timeDevice.userId, userIds))
    .orderBy(asc(timeDevice.name));
  for (const row of rows) {
    const list = devices.get(row.userId) ?? [];
    list.push(toDeviceDto(row));
    devices.set(row.userId, list);
  }
  return devices;
}

export async function getMyStatus(
  userId: string,
): Promise<{ active: boolean; devices: DeviceDto[] }> {
  const devices = (await listDevices([userId])).get(userId) ?? [];
  const since = Date.now() - DAY_MS;
  return { active: devices.some((d) => Date.parse(d.lastSeenAt) >= since), devices };
}

// ── Suggestions ────────────────────────────────────────────────────────────

interface BatchContext {
  rules: RuleFacts[];
  stretches: Stretch[];
  initiatives: ClientInitiative[] | null;
  tickets: Map<string, Ticket | null>;
}

// The project a rule's ticket or initiative is in, per rule id. A rule with no target
// (ignore) is left out.
async function ruleProjects(rules: RuleRow[]): Promise<Map<number, number>> {
  const iids = rules.map((r) => r.issueId).filter((id): id is number => id != null);
  const nids = rules.map((r) => r.initiativeId).filter((id): id is number => id != null);
  const issues = iids.length
    ? await db
        .select({ id: issue.id, projectId: issue.projectId })
        .from(issue)
        .where(inArray(issue.id, iids))
    : [];
  const initiatives = nids.length
    ? await db
        .select({ id: initiative.id, projectId: initiative.projectId })
        .from(initiative)
        .where(inArray(initiative.id, nids))
    : [];
  const byIssue = new Map(issues.map((i) => [i.id, i.projectId]));
  const byInitiative = new Map(initiatives.map((i) => [i.id, i.projectId]));
  const projects = new Map<number, number>();
  for (const r of rules) {
    const projectId =
      r.issueId != null
        ? byIssue.get(r.issueId)
        : r.initiativeId != null
          ? byInitiative.get(r.initiativeId)
          : undefined;
    if (projectId !== undefined) projects.set(r.id, projectId);
  }
  return projects;
}

// The person's own rules and the team rules whose target is in a project they can
// reach. A team rule is written for one project, and its target names a ticket of
// that project to whoever reads the rule.
async function rulesFor(userId: string): Promise<RuleRow[]> {
  const rows = await db
    .select()
    .from(timeRule)
    .where(or(eq(timeRule.userId, userId), isNull(timeRule.userId)))
    .orderBy(sql`${timeRule.userId} is null`, asc(timeRule.id));
  const projects = await ruleProjects(rows.filter((r) => r.userId === null));
  const reachable = new Map<number, boolean>();
  const kept: RuleRow[] = [];
  for (const row of rows) {
    const projectId = row.userId === null ? projects.get(row.id) : undefined;
    if (projectId === undefined) {
      kept.push(row);
      continue;
    }
    if (!reachable.has(projectId)) {
      reachable.set(projectId, (await getProjectAccess(projectId, userId)) !== null);
    }
    if (reachable.get(projectId)) kept.push(row);
  }
  return kept;
}

async function batchContext(userId: string, from: Date, to: Date): Promise<BatchContext> {
  const rules = await rulesFor(userId);
  const stretches = await db
    .select({
      issueId: issueStatus.issueId,
      initiativeId: issue.initiativeId,
      enteredAt: issueStatus.enteredAt,
      leftAt: issueStatus.leftAt,
    })
    .from(issueStatus)
    .innerJoin(issue, eq(issue.id, issueStatus.issueId))
    .where(
      and(
        eq(issue.assigneeUserId, userId),
        eq(issueStatus.stateType, 'started'),
        lt(issueStatus.enteredAt, to),
        or(isNull(issueStatus.leftAt), gt(issueStatus.leftAt, from)),
      ),
    );
  return { rules, stretches, initiatives: null, tickets: new Map() };
}

// The initiatives of the projects the person is a member of, with their labels.
async function clientInitiatives(userId: string): Promise<ClientInitiative[]> {
  const rows = await db
    .select({ id: initiative.id, title: initiative.title })
    .from(initiative)
    .innerJoin(
      projectMember,
      and(eq(projectMember.projectId, initiative.projectId), eq(projectMember.userId, userId)),
    );
  if (rows.length === 0) return [];
  const labels = await db
    .select({ initiativeId: initiativeLabel.initiativeId, name: label.name })
    .from(initiativeLabel)
    .innerJoin(label, eq(label.id, initiativeLabel.labelId))
    .where(
      inArray(
        initiativeLabel.initiativeId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    ...r,
    labels: labels.filter((l) => l.initiativeId === r.id).map((l) => l.name),
  }));
}

// The ticket a title names, when the person can reach its project.
async function ticketNamed(userId: string, title: string): Promise<Ticket | null> {
  const ref = ticketRef(title);
  if (!ref) return null;
  const projects = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.key, ref.key));
  for (const p of projects) {
    if (!(await getProjectAccess(p.id, userId))) continue;
    const found = await getIssueBySequence(p.id, ref.sequenceNumber);
    if (!found) continue;
    const [row] = await db
      .select({ initiativeId: issue.initiativeId })
      .from(issue)
      .where(eq(issue.id, found.id));
    return { id: found.id, identifier: found.identifier, initiativeId: row?.initiativeId ?? null };
  }
  return null;
}

async function suggestFor(
  userId: string,
  block: BlockFacts,
  ctx: BatchContext,
): Promise<Suggestion> {
  const key = ticketRef(block.title);
  const cacheKey = key ? `${key.key}-${key.sequenceNumber}` : '';
  if (cacheKey && !ctx.tickets.has(cacheKey))
    ctx.tickets.set(cacheKey, await ticketNamed(userId, block.title));
  if (block.source === 'call' && ctx.initiatives === null)
    ctx.initiatives = await clientInitiatives(userId);
  const context: SuggestionContext = {
    ticket: cacheKey ? (ctx.tickets.get(cacheKey) ?? null) : null,
    rules: ctx.rules,
    stretches: ctx.stretches,
    initiatives: ctx.initiatives ?? [],
  };
  return suggest(block, context);
}

function suggestionColumns(s: Suggestion) {
  return {
    status: s.ignore ? 'ignored' : 'pending',
    suggestedIssueId: s.ignore ? null : s.issueId,
    suggestedInitiativeId: s.ignore ? null : s.initiativeId,
    confidence: s.confidence,
    reason: s.reason,
    ruleId: s.ruleId,
  };
}

// ── Upload ─────────────────────────────────────────────────────────────────

export interface UploadBlock {
  sourceKey: string;
  source: string;
  startedAt: string;
  endedAt: string;
  app: string;
  title: string;
  domain: string | null;
  detail?: Record<string, unknown>;
}

// Upserts by (user, sourceKey). A confirmed or ignored block is never changed; a
// pending one takes the new facts and a fresh suggestion.
export async function uploadBlocks(
  userId: string,
  device: string,
  blocks: UploadBlock[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const parsed = blocks.map((b) => {
    const startedAt = new Date(b.startedAt);
    const endedAt = new Date(b.endedAt);
    const length = endedAt.getTime() - startedAt.getTime();
    if (Number.isNaN(length) || length <= 0 || length > DAY_MS) {
      throw new HttpError(
        400,
        `Block ${b.sourceKey}: endedAt must be after startedAt and within a day of it`,
      );
    }
    return { ...b, startedAt, endedAt, detail: b.detail ?? {} };
  });
  await db
    .update(timeDevice)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(timeDevice.userId, userId), eq(timeDevice.name, device)));
  const counts = { inserted: 0, updated: 0, skipped: 0 };
  if (parsed.length === 0) return counts;
  const from = new Date(Math.min(...parsed.map((b) => b.startedAt.getTime())));
  const to = new Date(Math.max(...parsed.map((b) => b.endedAt.getTime())));
  const ctx = await batchContext(userId, from, to);
  const keys = parsed.map((b) => b.sourceKey);
  const existing = new Map(
    (
      await db
        .select({ id: timeBlock.id, status: timeBlock.status, sourceKey: timeBlock.sourceKey })
        .from(timeBlock)
        .where(and(eq(timeBlock.userId, userId), inArray(timeBlock.sourceKey, keys)))
    ).map((r) => [r.sourceKey, r]),
  );
  // The halves of a split carry `<sourceKey>#<cut>`; a re-upload of the original
  // would put the whole block back beside them.
  const parent = sql<string>`split_part(${timeBlock.sourceKey}, '#', 1)`;
  const split = new Set(
    (
      await db
        .select({ parent })
        .from(timeBlock)
        .where(
          and(
            eq(timeBlock.userId, userId),
            sql`${timeBlock.sourceKey} like '%#%'`,
            inArray(parent, keys),
          ),
        )
    ).map((r) => r.parent),
  );
  for (const b of parsed) {
    const found = existing.get(b.sourceKey);
    if (split.has(b.sourceKey) || (found && found.status !== 'pending')) {
      counts.skipped++;
      continue;
    }
    const facts = {
      device,
      source: b.source,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      seconds: Math.round((b.endedAt.getTime() - b.startedAt.getTime()) / 1000),
      app: b.app,
      title: b.title,
      domain: b.domain,
      detail: b.detail,
    };
    const values = { ...facts, ...suggestionColumns(await suggestFor(userId, facts, ctx)) };
    if (found) {
      await db.update(timeBlock).set(values).where(eq(timeBlock.id, found.id));
      counts.updated++;
    } else {
      await db.insert(timeBlock).values({ ...values, userId, sourceKey: b.sourceKey });
      counts.inserted++;
    }
  }
  return counts;
}

// ── The day ────────────────────────────────────────────────────────────────

export interface MyDay {
  date: string;
  blocks: TimeBlockDto[];
  totals: {
    capturedSeconds: number;
    confirmedSeconds: number;
    pendingSeconds: number;
    ignoredSeconds: number;
    confidentPending: number;
  };
  devices: DeviceDto[];
}

export async function getMyDay(user: AuthUser, date: string): Promise<MyDay> {
  const [start, end] = londonDayRange(date);
  const rows = await db
    .select()
    .from(timeBlock)
    .where(
      and(
        eq(timeBlock.userId, user.id),
        gte(timeBlock.startedAt, start),
        lt(timeBlock.startedAt, end),
      ),
    )
    .orderBy(asc(timeBlock.startedAt), asc(timeBlock.id));
  const refs = await blockRefs(rows);
  const weekStart = londonWeekStart(new Date());
  const sum = (status: string) =>
    rows.filter((r) => r.status === status).reduce((n, r) => n + r.seconds, 0);
  return {
    date,
    blocks: rows.map((r) => toBlockDto(r, refs, weekStart, user)),
    totals: {
      capturedSeconds: rows.reduce((n, r) => n + r.seconds, 0),
      confirmedSeconds: sum('confirmed'),
      pendingSeconds: sum('pending'),
      ignoredSeconds: sum('ignored'),
      confidentPending: rows.filter((r) => isConfident(r, CONFIDENT)).length,
    },
    devices: (await listDevices([user.id])).get(user.id) ?? [],
  };
}

function isConfident(row: BlockRow, minConfidence: number): boolean {
  return (
    row.status === 'pending' &&
    row.confidence >= minConfidence &&
    (row.suggestedIssueId != null || row.suggestedInitiativeId != null)
  );
}

// ── Allocation ─────────────────────────────────────────────────────────────

export interface AllocateInput {
  action: 'confirm' | 'ignore' | 'reset';
  issueId?: number | null;
  initiativeId?: number | null;
  remember?: boolean;
}

interface Target {
  issueId: number | null;
  initiativeId: number | null;
}

async function issueTarget(
  user: AuthUser,
  issueId: number,
): Promise<{ projectId: number; initiativeId: number | null }> {
  const [row] = await db
    .select({ projectId: issue.projectId, initiativeId: issue.initiativeId })
    .from(issue)
    .where(eq(issue.id, issueId));
  if (!row || !(await getProjectAccess(row.projectId, user.id)))
    throw new HttpError(400, 'Ticket not found');
  // Confirming logs time on the ticket, which POST /issues/:id/worklogs allows on edit.
  await assertPermission(row.projectId, user, 'work_items', 'edit');
  return row;
}

async function assertInitiative(user: AuthUser, initiativeId: number): Promise<void> {
  const [row] = await db
    .select({ projectId: initiative.projectId })
    .from(initiative)
    .where(eq(initiative.id, initiativeId));
  if (!row || !(await getProjectAccess(row.projectId, user.id)))
    throw new HttpError(400, 'Initiative not found');
}

// A suggestion is checked again when it is taken: the person's standing in the
// ticket's project can have changed since it was made.
async function checkTarget(user: AuthUser, target: Target): Promise<void> {
  if (target.issueId != null) await issueTarget(user, target.issueId);
  if (target.initiativeId != null) await assertInitiative(user, target.initiativeId);
}

// The target of a confirm: what the body names, else the suggestion. A ticket named
// without an initiative takes the ticket's own.
async function resolveTarget(user: AuthUser, row: BlockRow, input: AllocateInput): Promise<Target> {
  if (input.issueId === undefined && input.initiativeId === undefined) {
    const target = { issueId: row.suggestedIssueId, initiativeId: row.suggestedInitiativeId };
    await checkTarget(user, target);
    return target;
  }
  const issueId = input.issueId ?? null;
  let initiativeId = input.initiativeId ?? null;
  if (issueId != null) {
    const found = await issueTarget(user, issueId);
    if (input.initiativeId === undefined) initiativeId = found.initiativeId;
  }
  if (initiativeId != null) await assertInitiative(user, initiativeId);
  return { issueId, initiativeId };
}

async function confirmBlock(row: BlockRow, target: Target): Promise<BlockRow> {
  if (target.issueId == null && target.initiativeId == null) {
    throw new HttpError(400, 'Choose a ticket or an initiative');
  }
  const [updated] = await db
    .update(timeBlock)
    .set({ status: 'confirmed', ...target, confirmedAt: new Date() })
    .where(eq(timeBlock.id, row.id))
    .returning();
  await syncWorklog(updated!);
  const asSuggested =
    target.issueId === row.suggestedIssueId && target.initiativeId === row.suggestedInitiativeId;
  if (row.ruleId != null && row.status !== 'confirmed' && asSuggested) {
    await db
      .update(timeRule)
      .set({ hits: sql`${timeRule.hits} + 1` })
      .where(eq(timeRule.id, row.ruleId));
  }
  return updated!;
}

async function setStatus(row: BlockRow, status: 'pending' | 'ignored'): Promise<BlockRow> {
  const [updated] = await db
    .update(timeBlock)
    .set({ status, issueId: null, initiativeId: null, confirmedAt: null })
    .where(eq(timeBlock.id, row.id))
    .returning();
  await syncWorklog(updated!);
  return updated!;
}

// One worklog per confirmed block with a ticket, none otherwise.
async function syncWorklog(row: BlockRow): Promise<void> {
  if (row.status !== 'confirmed' || row.issueId == null) {
    await db.delete(issueWorklog).where(eq(issueWorklog.timeBlockId, row.id));
    return;
  }
  const values = {
    issueId: row.issueId,
    userId: row.userId,
    minutes: Math.max(1, Math.round(row.seconds / 60)),
    spentOn: londonDate(row.startedAt),
    // The team reads the worklog; the block's title stays with its person.
    note: `Time capture: ${row.app}`.slice(0, 500),
    timeBlockId: row.id,
  };
  await db
    .insert(issueWorklog)
    .values(values)
    .onConflictDoUpdate({ target: issueWorklog.timeBlockId, set: values });
}

// A personal rule from the block: a call's contact, else its domain, else a
// distinctive title word, else its app. An existing rule on the same text takes the
// new target.
async function rememberRule(
  userId: string,
  row: BlockRow,
  target: Target & { ignore: boolean },
): Promise<void> {
  const contact = callContact({ ...row, detail: (row.detail ?? {}) as Record<string, unknown> });
  const word = distinctiveWord(row.title);
  const [field, pattern] = contact
    ? ['contact', contact]
    : row.domain
      ? ['domain', row.domain]
      : word
        ? ['title', word]
        : ['app', row.app];
  if (!pattern) return;
  const values = { userId, field, pattern, ...target };
  const [existing] = await db
    .select({ id: timeRule.id })
    .from(timeRule)
    .where(
      and(
        eq(timeRule.userId, userId),
        eq(timeRule.field, field),
        sql`lower(${timeRule.pattern}) = lower(${pattern})`,
      ),
    );
  if (existing) await db.update(timeRule).set(values).where(eq(timeRule.id, existing.id));
  else await db.insert(timeRule).values(values);
}

export async function allocate(
  user: AuthUser,
  blockId: number,
  input: AllocateInput,
): Promise<TimeBlockDto> {
  const row = await ownBlock(user.id, blockId);
  assertUnlocked(row, user);
  let updated: BlockRow;
  if (input.action === 'confirm') {
    const target = await resolveTarget(user, row, input);
    updated = await confirmBlock(row, target);
    if (input.remember) await rememberRule(user.id, row, { ...target, ignore: false });
  } else {
    updated = await setStatus(row, input.action === 'ignore' ? 'ignored' : 'pending');
    if (input.remember && input.action === 'ignore') {
      await rememberRule(user.id, row, { issueId: null, initiativeId: null, ignore: true });
    }
  }
  return blockDto(updated, user);
}

// Two blocks out of one at an instant inside it. Both keep the allocation and the
// suggestion; the seconds add up to the original.
export async function splitBlock(
  user: AuthUser,
  blockId: number,
  at: string,
): Promise<TimeBlockDto[]> {
  const row = await ownBlock(user.id, blockId);
  assertUnlocked(row, user);
  const cut = new Date(at);
  if (Number.isNaN(cut.getTime()) || cut <= row.startedAt || cut >= row.endedAt) {
    throw new HttpError(400, 'at must be inside the block');
  }
  const { id: _id, createdAt: _createdAt, ...rest } = row;
  const [first, second] = await db.transaction(async (tx) => {
    const [a] = await tx
      .update(timeBlock)
      .set({ endedAt: cut, seconds: Math.round((cut.getTime() - row.startedAt.getTime()) / 1000) })
      .where(eq(timeBlock.id, row.id))
      .returning();
    const [b] = await tx
      .insert(timeBlock)
      .values({
        ...rest,
        sourceKey: `${row.sourceKey}#${cut.getTime()}`,
        startedAt: cut,
        seconds: row.seconds - a!.seconds,
      })
      .returning();
    return [a!, b!];
  });
  await syncWorklog(first);
  await syncWorklog(second);
  const refs = await blockRefs([first, second]);
  const weekStart = londonWeekStart(new Date());
  return [toBlockDto(first, refs, weekStart, user), toBlockDto(second, refs, weekStart, user)];
}

// A new ticket in the project, assigned to the person, and the block confirmed to it.
export async function captureTask(
  user: AuthUser,
  blockId: number,
  input: { projectKey: string; title: string; initiativeId?: number | null },
): Promise<TimeBlockDto> {
  const row = await ownBlock(user.id, blockId);
  assertUnlocked(row, user);
  const target = await getProjectByRef(input.projectKey, user.id);
  if (!target) throw new HttpError(404, `Project '${input.projectKey}' not found`);
  await assertPermission(target.id, user, 'work_items', 'create');
  const [column] = await listColumns(target.id);
  if (!column) throw new HttpError(409, 'The project has no columns');
  const created = await createIssue(
    target,
    {
      columnId: column.id,
      title: input.title,
      assigneeUserId: user.id,
      initiativeId: input.initiativeId ?? null,
    },
    user.id,
  );
  const updated = await confirmBlock(row, {
    issueId: created.id,
    initiativeId: input.initiativeId ?? null,
  });
  return blockDto(updated, user);
}

// Confirms the day's pending blocks whose suggestion is confident enough.
export async function confirmDay(
  user: AuthUser,
  date: string,
  minConfidence = CONFIDENT,
): Promise<{ confirmed: number }> {
  const [start, end] = londonDayRange(date);
  const rows = await db
    .select()
    .from(timeBlock)
    .where(
      and(
        eq(timeBlock.userId, user.id),
        eq(timeBlock.status, 'pending'),
        gte(timeBlock.startedAt, start),
        lt(timeBlock.startedAt, end),
      ),
    );
  const weekStart = londonWeekStart(new Date());
  let confirmed = 0;
  for (const row of rows) {
    if (!isConfident(row, minConfidence) || isLocked(row, weekStart, user)) continue;
    const target = { issueId: row.suggestedIssueId, initiativeId: row.suggestedInitiativeId };
    try {
      await checkTarget(user, target);
    } catch (err) {
      if (err instanceof HttpError) continue;
      throw err;
    }
    await confirmBlock(row, target);
    confirmed++;
  }
  return { confirmed };
}

// ── Rules ──────────────────────────────────────────────────────────────────

export async function listRules(userId: string): Promise<TimeRuleDto[]> {
  return toRuleDtos(await rulesFor(userId));
}

export interface RuleInput {
  field: string;
  pattern: string;
  issueId?: number | null;
  initiativeId?: number | null;
  ignore?: boolean;
}

export async function createRule(user: AuthUser, input: RuleInput): Promise<TimeRuleDto> {
  const ignore = input.ignore ?? false;
  const issueId = input.issueId ?? null;
  const initiativeId = input.initiativeId ?? null;
  const pattern = input.pattern.trim();
  if (pattern.length < 2) throw new HttpError(400, 'pattern needs at least two characters');
  if (!ignore && issueId == null && initiativeId == null) {
    throw new HttpError(400, 'A rule names a ticket, an initiative, or ignore');
  }
  if (issueId != null) await issueTarget(user, issueId);
  if (initiativeId != null) await assertInitiative(user, initiativeId);
  const [row] = await db
    .insert(timeRule)
    .values({
      userId: user.id,
      field: input.field,
      pattern,
      issueId: ignore ? null : issueId,
      initiativeId: ignore ? null : initiativeId,
      ignore,
    })
    .returning();
  return (await toRuleDtos([row!]))[0]!;
}

export async function deleteRule(userId: string, ruleId: number): Promise<void> {
  const deleted = await db
    .delete(timeRule)
    .where(and(eq(timeRule.id, ruleId), eq(timeRule.userId, userId)))
    .returning({ id: timeRule.id });
  if (deleted.length === 0) throw new HttpError(404, 'Rule not found');
}

// A project owner's own rule, made the team's. Its target must be in the project.
export async function promoteRule(
  projectId: number,
  userId: string,
  ruleId: number,
): Promise<TimeRuleDto> {
  const [rule] = await db
    .select()
    .from(timeRule)
    .where(and(eq(timeRule.id, ruleId), eq(timeRule.userId, userId)));
  if (!rule) throw new HttpError(404, 'Rule not found');
  if (rule.issueId != null) {
    const [row] = await db
      .select({ projectId: issue.projectId })
      .from(issue)
      .where(eq(issue.id, rule.issueId));
    if (row?.projectId !== projectId)
      throw new HttpError(400, 'The ticket must belong to this project');
  }
  if (rule.initiativeId != null) {
    const [row] = await db
      .select({ projectId: initiative.projectId })
      .from(initiative)
      .where(eq(initiative.id, rule.initiativeId));
    if (row?.projectId !== projectId)
      throw new HttpError(400, 'The initiative must belong to this project');
  }
  const [updated] = await db
    .update(timeRule)
    .set({ userId: null })
    .where(eq(timeRule.id, ruleId))
    .returning();
  return (await toRuleDtos([updated!]))[0]!;
}

// ── The team ───────────────────────────────────────────────────────────────

export interface TeamMemberTime {
  userId: string;
  name: string;
  devices: DeviceDto[];
  confirmedSecondsThisWeek: number;
  pendingSecondsThisWeek: number;
}

export async function getTeamTime(projectId: number): Promise<TeamMemberTime[]> {
  const members = await listAllMembers(projectId);
  const ids = members.map((m) => m.userId);
  if (ids.length === 0) return [];
  const devices = await listDevices(ids);
  const sums = await db
    .select({
      userId: timeBlock.userId,
      status: timeBlock.status,
      seconds: sql<number>`coalesce(sum(${timeBlock.seconds}), 0)::int`,
    })
    .from(timeBlock)
    .where(
      and(inArray(timeBlock.userId, ids), gte(timeBlock.startedAt, londonWeekStart(new Date()))),
    )
    .groupBy(timeBlock.userId, timeBlock.status);
  const seconds = (userId: string, status: string) =>
    sums.find((s) => s.userId === userId && s.status === status)?.seconds ?? 0;
  return members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      devices: devices.get(m.userId) ?? [],
      confirmedSecondsThisWeek: seconds(m.userId, 'confirmed'),
      pendingSecondsThisWeek: seconds(m.userId, 'pending'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Retention ──────────────────────────────────────────────────────────────

// Pending blocks older than 30 days and ignored blocks older than 7 are deleted.
export async function pruneBlocks(now = new Date()): Promise<number> {
  const deleted = await db
    .delete(timeBlock)
    .where(
      or(
        and(
          eq(timeBlock.status, 'pending'),
          lt(timeBlock.startedAt, new Date(now.getTime() - 30 * DAY_MS)),
        ),
        and(
          eq(timeBlock.status, 'ignored'),
          lt(timeBlock.startedAt, new Date(now.getTime() - 7 * DAY_MS)),
        ),
      ),
    )
    .returning({ id: timeBlock.id });
  return deleted.length;
}

// Confirmed captured seconds per initiative in [start, end): the block's own
// initiative, else its ticket's. Read by the Time page totals.
export async function confirmedSecondsByInitiative(
  initiativeIds: number[],
  start: Date,
  end: Date,
): Promise<Map<number, number>> {
  if (initiativeIds.length === 0) return new Map();
  const target = sql<number>`coalesce(${timeBlock.initiativeId}, ${issue.initiativeId})`;
  const rows = await db
    .select({
      initiativeId: target,
      seconds: sql<number>`coalesce(sum(${timeBlock.seconds}), 0)::int`,
    })
    .from(timeBlock)
    .leftJoin(issue, eq(issue.id, timeBlock.issueId))
    .where(
      and(
        eq(timeBlock.status, 'confirmed'),
        gte(timeBlock.startedAt, start),
        lt(timeBlock.startedAt, end),
        inArray(target, initiativeIds),
      ),
    )
    .groupBy(target);
  return new Map(rows.map((r) => [Number(r.initiativeId), r.seconds]));
}
