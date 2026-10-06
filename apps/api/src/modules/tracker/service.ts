import {
  cycle,
  db,
  getSetting,
  initiative,
  issue,
  issueStatus,
  project,
  projectMember,
  setSetting,
  trackerEntry,
  trackerMeasure,
  trackerTargetVersion,
  user,
} from '@repo/db';
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { getBillingSettings } from '#modules/settings/service';
import { getCycleBillables } from '#modules/cycles/billables';
import { ticketValue } from '#modules/performance/service';
import {
  DEFAULT_TRACKER_SETTINGS,
  colourPeriods,
  financeTarget,
  isClosed,
  nextPeriodStart,
  periodStartOf,
  periodsBetween,
  recentPeriods,
  ruleTarget,
  type Cadence,
  type Colour,
  type Direction,
  type Kind,
  type TargetRule,
  type TrackerSettings,
  type Unit,
} from './engine';

const SETTING_KEY = 'tracker';

export async function getTrackerSettings(): Promise<TrackerSettings> {
  const stored = await getSetting<Partial<TrackerSettings>>(SETTING_KEY);
  return {
    ...DEFAULT_TRACKER_SETTINGS,
    ...stored,
    streaks: { ...DEFAULT_TRACKER_SETTINGS.streaks, ...stored?.streaks },
  };
}

export async function setTrackerSettings(next: TrackerSettings): Promise<TrackerSettings> {
  if (next.amberPercent > next.greenPercent)
    throw new HttpError(400, 'The amber threshold must not be above the green threshold');
  const clean = {
    ...next,
    loops: [...new Set(next.loops.map((l) => l.trim()).filter(Boolean))],
    companies: [...new Set(next.companies.map((c) => c.trim()).filter(Boolean))],
  };
  if (clean.loops.length === 0) throw new HttpError(400, 'At least one loop is needed');
  await setSetting(SETTING_KEY, clean);
  return clean;
}

export interface Actor {
  id: string;
  role?: string | null;
}

const isGod = (a: Actor) => a.role === 'god';

async function readableProjectIds(actor: Actor): Promise<number[] | null> {
  if (isGod(actor)) return null;
  const rows = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, actor.id));
  return rows.map((r) => r.projectId);
}

type MeasureRow = typeof trackerMeasure.$inferSelect;
type VersionRow = typeof trackerTargetVersion.$inferSelect;

async function loadMeasure(id: number): Promise<MeasureRow> {
  const [row] = await db.select().from(trackerMeasure).where(eq(trackerMeasure.id, id));
  if (!row || row.archivedAt) throw new HttpError(404, 'Measure not found');
  return row;
}

async function assertCanRead(actor: Actor, m: MeasureRow) {
  const ids = await readableProjectIds(actor);
  if (ids && !ids.includes(m.projectId)) throw new HttpError(404, 'Measure not found');
}

// Targets are the instance owner's, unless the settings hand them to the measure owner.
async function assertCanSetTargets(actor: Actor, ownerUserId: string | null) {
  if (isGod(actor)) return;
  const s = await getTrackerSettings();
  if (s.targetSetters === 'measure_owner' && ownerUserId === actor.id) return;
  throw new HttpError(403, 'Only the target setter may change measures and targets');
}

// The figure is entered by the measure's owner, the initiative's owner, or the
// instance owner.
async function assertCanEnter(actor: Actor, m: MeasureRow) {
  if (isGod(actor) || m.ownerUserId === actor.id) return;
  if (m.initiativeId) {
    const [i] = await db
      .select({ ownerUserId: initiative.ownerUserId })
      .from(initiative)
      .where(eq(initiative.id, m.initiativeId));
    if (i?.ownerUserId === actor.id) return;
  }
  throw new HttpError(403, "Only the measure's or the initiative's owner may enter figures");
}

// ─── automatic figures ──────────────────────────────────────────────────────────

// Billings (value of completed client work) or completed tickets per period, for the
// measure's project or initiative. Same counting as the performance share.
async function systemActuals(
  m: MeasureRow,
  periods: string[],
  cadence: Cadence,
): Promise<Map<string, number>> {
  const out = new Map(periods.map((p) => [p, 0]));
  if (periods.length === 0) return out;
  const start = new Date(`${periods[0]}T00:00:00Z`);
  const end = new Date(`${nextPeriodStart(periods.at(-1)!, cadence)}T00:00:00Z`);
  const { hoursPerDay } = await getBillingSettings();
  const rows = await db
    .select({
      enteredAt: issueStatus.enteredAt,
      estimateMinutes: issue.estimateMinutes,
      valueOverridePence: issue.valueOverridePence,
      internal: project.internal,
      billingModel: initiative.billingModel,
      dayRatePence: initiative.dayRatePence,
    })
    .from(issueStatus)
    .innerJoin(issue, eq(issue.id, issueStatus.issueId))
    .innerJoin(project, eq(project.id, issue.projectId))
    .leftJoin(initiative, eq(initiative.id, issue.initiativeId))
    .where(
      and(
        isNull(issueStatus.leftAt),
        eq(issueStatus.stateType, 'completed'),
        gte(issueStatus.enteredAt, start),
        lt(issueStatus.enteredAt, end),
        eq(issue.projectId, m.projectId),
        m.initiativeId ? eq(issue.initiativeId, m.initiativeId) : undefined,
      ),
    );
  for (const r of rows) {
    const p = periodStartOf(r.enteredAt.toISOString().slice(0, 10), cadence);
    if (!out.has(p)) continue;
    if (m.source === 'tickets_completed') out.set(p, out.get(p)! + 1);
    else if (!r.internal && r.billingModel !== 'internal')
      out.set(p, out.get(p)! + ticketValue(r, hoursPerDay));
  }
  return out;
}

// The finance rule's target per period: the project's cycle targets, or for an
// initiative its planned value in each cycle, spread over the periods by working days.
async function financeTargets(
  m: MeasureRow,
  periods: string[],
  cadence: Cadence,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (periods.length === 0) return out;
  const last = nextPeriodStart(periods.at(-1)!, cadence);
  const rows = await db
    .select()
    .from(cycle)
    .where(
      and(
        eq(cycle.projectId, m.projectId),
        lt(cycle.startDate, last),
        gte(cycle.endDate, periods[0]!),
      ),
    );
  const cycles = await Promise.all(
    rows.map(async (c) => {
      let value = c.targetPence;
      if (m.initiativeId || value == null) {
        const b = await getCycleBillables(c.id);
        value = m.initiativeId
          ? (b.groups.find((g) => g.initiativeId === m.initiativeId && g.kind === 'billable')
              ?.valuePence ?? 0)
          : b.totals.netPence;
      }
      return { startDate: c.startDate, endDate: c.endDate, value };
    }),
  );
  for (const p of periods) out.set(p, financeTarget(p, nextPeriodStart(p, cadence), cycles));
  return out;
}

// ─── the board ──────────────────────────────────────────────────────────────────

export interface TrackerCell {
  periodStart: string;
  target: number | null;
  actual: number | null;
  done: boolean | null;
  colour: Colour;
  streak: number;
  focus: boolean;
  rolling: { actual: number; target: number } | null;
  verified: boolean;
  restated: boolean;
  note: string;
  evidence: string;
  closed: boolean;
}

export interface TrackerMeasureView {
  id: number;
  projectId: number;
  projectKey: string;
  initiativeId: number | null;
  initiativeTitle: string | null;
  company: string;
  loop: string;
  name: string;
  definition: string;
  kind: Kind;
  unit: Unit;
  direction: Direction;
  cadence: Cadence;
  unlockPeriods: number;
  source: string;
  ownerUserId: string | null;
  ownerName: string | null;
  startsOn: string;
  rule: TargetRule;
  targetHistory: { effectiveFrom: string; rule: TargetRule; reason: string; createdAt: string }[];
  canEnter: boolean;
  canEdit: boolean;
  cells: TrackerCell[];
}

export interface BoardFilters {
  company?: string;
  loop?: string;
  projectId?: number;
  initiativeId?: number;
}

function ruleAt(versions: VersionRow[], periodStart: string): TargetRule | null {
  let rule: TargetRule | null = null;
  for (const v of versions) if (v.effectiveFrom <= periodStart) rule = v.rule as TargetRule;
  return rule ?? (versions[0]?.rule as TargetRule | undefined) ?? null;
}

async function viewOf(
  m: MeasureRow & {
    projectKey: string;
    initiativeTitle: string | null;
    ownerName: string | null;
    initiativeOwner: string | null;
  },
  versions: VersionRow[],
  entries: (typeof trackerEntry.$inferSelect)[],
  actor: Actor,
  s: TrackerSettings,
  now: Date,
): Promise<TrackerMeasureView> {
  const cadence = m.cadence as Cadence;
  const today = now.toISOString().slice(0, 10);
  const startPeriod = periodStartOf(m.startsOn, cadence);
  const periods = recentPeriods(today, cadence, s.historyPeriods).filter((p) => p >= startPeriod);
  const usesFinance = versions.some((v) => (v.rule as TargetRule).type === 'finance');
  const [system, finance] = await Promise.all([
    m.source === 'manual' ? null : systemActuals(m, periods, cadence),
    usesFinance ? financeTargets(m, periods, cadence) : null,
  ]);
  const byPeriod = new Map(entries.map((e) => [e.periodStart, e]));

  const inputs = periods.map((p) => {
    const index = periodsBetween(startPeriod, p, cadence);
    const rule = ruleAt(versions, p);
    const target = rule ? ruleTarget(rule, index, p, cadence, finance?.get(p) ?? null) : null;
    const closed = isClosed(p, cadence, now, s.closeAfterHours);
    const entry = byPeriod.get(p);
    const actual = system ? (system.get(p) ?? 0) : (entry?.actual ?? null);
    return {
      periodStart: p,
      closed,
      locked: index < m.unlockPeriods,
      target,
      actual,
      done: entry?.done ?? null,
      // A system figure exists once the period has started; it is complete when closed.
      hasEntry: system ? true : !!entry,
      partial: !!system,
    };
  });
  const results = colourPeriods(
    inputs,
    { kind: m.kind as Kind, unit: m.unit as Unit, direction: m.direction as Direction },
    s,
  );
  const mayEnter =
    m.source === 'manual' &&
    (isGod(actor) || m.ownerUserId === actor.id || m.initiativeOwner === actor.id);
  const mayEdit =
    isGod(actor) || (s.targetSetters === 'measure_owner' && m.ownerUserId === actor.id);

  return {
    id: m.id,
    projectId: m.projectId,
    projectKey: m.projectKey,
    initiativeId: m.initiativeId,
    initiativeTitle: m.initiativeTitle,
    company: m.company,
    loop: m.loop,
    name: m.name,
    definition: m.definition,
    kind: m.kind as Kind,
    unit: m.unit as Unit,
    direction: m.direction as Direction,
    cadence,
    unlockPeriods: m.unlockPeriods,
    source: m.source,
    ownerUserId: m.ownerUserId,
    ownerName: m.ownerName,
    startsOn: m.startsOn,
    rule: (versions.at(-1)?.rule as TargetRule) ?? { type: 'fixed', value: 0 },
    targetHistory: versions.map((v) => ({
      effectiveFrom: v.effectiveFrom,
      rule: v.rule as TargetRule,
      reason: v.reason,
      createdAt: iso(v.createdAt)!,
    })),
    canEnter: mayEnter,
    canEdit: mayEdit,
    cells: inputs.map((input, i) => {
      const entry = byPeriod.get(input.periodStart);
      return {
        periodStart: input.periodStart,
        target: input.target == null ? null : Math.round(input.target * 100) / 100,
        actual: input.actual,
        done: input.done,
        ...results[i]!,
        verified: system ? true : (entry?.verified ?? true),
        restated: !!entry?.restatedAt,
        note: entry?.note ?? '',
        evidence: system ? 'It’s a Plan' : (entry?.evidence ?? ''),
        closed: input.closed,
      };
    }),
  };
}

export async function getBoard(actor: Actor, filters: BoardFilters, now = new Date()) {
  const s = await getTrackerSettings();
  const ids = await readableProjectIds(actor);
  const owner = sql<string | null>`${user.name}`;
  const rows = await db
    .select({
      m: trackerMeasure,
      projectKey: project.key,
      initiativeTitle: initiative.title,
      initiativeOwner: initiative.ownerUserId,
      ownerName: owner,
    })
    .from(trackerMeasure)
    .innerJoin(project, eq(project.id, trackerMeasure.projectId))
    .leftJoin(initiative, eq(initiative.id, trackerMeasure.initiativeId))
    .leftJoin(user, eq(user.id, trackerMeasure.ownerUserId))
    .where(
      and(
        isNull(trackerMeasure.archivedAt),
        ids ? inArray(trackerMeasure.projectId, ids.length ? ids : [-1]) : undefined,
        filters.company ? eq(trackerMeasure.company, filters.company) : undefined,
        filters.loop ? eq(trackerMeasure.loop, filters.loop) : undefined,
        filters.projectId ? eq(trackerMeasure.projectId, filters.projectId) : undefined,
        filters.initiativeId ? eq(trackerMeasure.initiativeId, filters.initiativeId) : undefined,
      ),
    )
    .orderBy(asc(trackerMeasure.company), asc(trackerMeasure.loop), asc(trackerMeasure.name));

  const measureIds = rows.map((r) => r.m.id);
  const [versions, entries] = measureIds.length
    ? await Promise.all([
        db
          .select()
          .from(trackerTargetVersion)
          .where(inArray(trackerTargetVersion.measureId, measureIds))
          .orderBy(asc(trackerTargetVersion.effectiveFrom), asc(trackerTargetVersion.id)),
        db.select().from(trackerEntry).where(inArray(trackerEntry.measureId, measureIds)),
      ])
    : [[], []];

  const measures = await Promise.all(
    rows.map((r) =>
      viewOf(
        {
          ...r.m,
          projectKey: r.projectKey,
          initiativeTitle: r.initiativeTitle,
          initiativeOwner: r.initiativeOwner,
          ownerName: r.ownerName,
        },
        versions.filter((v) => v.measureId === r.m.id),
        entries.filter((e) => e.measureId === r.m.id),
        actor,
        s,
        now,
      ),
    ),
  );

  // Each loop's latest closed period per measure, counted by colour.
  const summary: Record<string, Record<Colour, number>> = {};
  for (const m of measures) {
    const latest = [...m.cells].reverse().find((c) => c.closed);
    if (!latest || latest.colour === 'grey') continue;
    const counts = (summary[m.loop] ??= {
      green: 0,
      amber: 0,
      red: 0,
      black: 0,
      grey: 0,
      open: 0,
    });
    counts[latest.colour]++;
  }

  // The weekly heartbeat: per week, how many weekly measures stood at each colour.
  const pulse = new Map<string, Record<Colour, number>>();
  for (const m of measures) {
    if (m.cadence !== 'week') continue;
    for (const c of m.cells) {
      const counts = pulse.get(c.periodStart) ?? {
        green: 0,
        amber: 0,
        red: 0,
        black: 0,
        grey: 0,
        open: 0,
      };
      counts[c.colour]++;
      pulse.set(c.periodStart, counts);
    }
  }

  return {
    pulse: [...pulse.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodStart, counts]) => ({ periodStart, ...counts })),
    settings: {
      loops: s.loops,
      companies: s.companies,
      greenPercent: s.greenPercent,
      amberPercent: s.amberPercent,
      targetSetters: s.targetSetters,
      maxMeasuresPerInitiative: s.maxMeasuresPerInitiative,
      historyPeriods: s.historyPeriods,
      closeAfterHours: s.closeAfterHours,
    },
    summary,
    measures,
  };
}

// ─── writes ─────────────────────────────────────────────────────────────────────

export interface MeasureInput {
  projectId: number;
  initiativeId: number | null;
  company: string;
  loop: string;
  name: string;
  definition: string;
  kind: Kind;
  unit: Unit;
  direction: Direction;
  cadence: Cadence;
  unlockPeriods: number;
  source: 'manual' | 'billings' | 'tickets_completed';
  ownerUserId: string | null;
  startsOn: string;
  rule: TargetRule;
  reason?: string;
}

async function validate(input: Omit<MeasureInput, 'rule' | 'reason'>, rule: TargetRule) {
  const s = await getTrackerSettings();
  if (!s.loops.includes(input.loop)) throw new HttpError(400, `Unknown loop: ${input.loop}`);
  if (!input.definition.trim())
    throw new HttpError(400, 'A measure needs its definition before it is tracked');
  if (input.unit === 'done' && input.source !== 'manual')
    throw new HttpError(400, 'A yes/no measure is entered by hand');
  if (input.initiativeId) {
    const [i] = await db
      .select({ projectId: initiative.projectId })
      .from(initiative)
      .where(eq(initiative.id, input.initiativeId));
    if (!i || i.projectId !== input.projectId)
      throw new HttpError(400, 'The initiative is not in that project');
  }
  if (rule.type === 'leapfrog' && rule.steps.some((st) => !/^\d{4}-\d{2}-\d{2}$/.test(st.from)))
    throw new HttpError(400, 'Each leapfrog step needs a date');
  return s;
}

export async function createMeasure(actor: Actor, input: MeasureInput) {
  await assertCanSetTargets(actor, input.ownerUserId);
  const s = await validate(input, input.rule);
  const ids = await readableProjectIds(actor);
  if (ids && !ids.includes(input.projectId)) throw new HttpError(404, 'Project not found');
  if (input.initiativeId) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(trackerMeasure)
      .where(
        and(eq(trackerMeasure.initiativeId, input.initiativeId), isNull(trackerMeasure.archivedAt)),
      );
    if (n >= s.maxMeasuresPerInitiative)
      throw new HttpError(
        409,
        `An initiative carries at most ${s.maxMeasuresPerInitiative} measures`,
      );
  }
  const { rule, reason, ...fields } = input;
  return db.transaction(async (tx) => {
    const [m] = await tx.insert(trackerMeasure).values(fields).returning();
    await tx.insert(trackerTargetVersion).values({
      measureId: m!.id,
      effectiveFrom: periodStartOf(input.startsOn, input.cadence),
      rule,
      reason: reason?.trim() || 'Initial target',
      changedByUserId: actor.id,
    });
    return { id: m!.id };
  });
}

// Changes the measure. A new rule applies from the current period on and needs a
// reason; earlier periods keep the rule they were judged against.
export async function updateMeasure(
  actor: Actor,
  id: number,
  patch: Partial<MeasureInput>,
  now = new Date(),
) {
  const m = await loadMeasure(id);
  await assertCanRead(actor, m);
  await assertCanSetTargets(actor, m.ownerUserId);
  const { rule, reason, ...fields } = patch;
  const merged = { ...m, ...fields } as unknown as MeasureInput;
  await validate(merged, rule ?? { type: 'fixed', value: 0 });
  if (rule && !reason?.trim()) throw new HttpError(400, 'A target change needs a reason');
  const effectiveFrom = periodStartOf(now.toISOString().slice(0, 10), merged.cadence as Cadence);
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length)
      await tx
        .update(trackerMeasure)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(trackerMeasure.id, id));
    if (rule) {
      await tx
        .delete(trackerTargetVersion)
        .where(
          and(
            eq(trackerTargetVersion.measureId, id),
            eq(trackerTargetVersion.effectiveFrom, effectiveFrom),
          ),
        );
      await tx.insert(trackerTargetVersion).values({
        measureId: id,
        effectiveFrom,
        rule,
        reason: reason!.trim(),
        changedByUserId: actor.id,
      });
    }
  });
  return { id };
}

export async function archiveMeasure(actor: Actor, id: number) {
  const m = await loadMeasure(id);
  await assertCanRead(actor, m);
  await assertCanSetTargets(actor, m.ownerUserId);
  await db.update(trackerMeasure).set({ archivedAt: new Date() }).where(eq(trackerMeasure.id, id));
}

export interface EntryInput {
  actual: number | null;
  done: boolean | null;
  note: string;
  verified: boolean;
  evidence: string;
}

// Records a period's figure. A change to a closed period keeps the value it replaces
// and marks the period restated.
export async function setEntry(
  actor: Actor,
  id: number,
  periodStart: string,
  input: EntryInput,
  now = new Date(),
) {
  const m = await loadMeasure(id);
  await assertCanRead(actor, m);
  await assertCanEnter(actor, m);
  const cadence = m.cadence as Cadence;
  if (m.source !== 'manual')
    throw new HttpError(400, "This measure's figures come from It's a Plan");
  if (periodStartOf(periodStart, cadence) !== periodStart)
    throw new HttpError(400, 'Not the start of a period');
  if (periodStart < periodStartOf(m.startsOn, cadence))
    throw new HttpError(400, 'The measure had not started in that period');
  if (periodStart > periodStartOf(now.toISOString().slice(0, 10), cadence))
    throw new HttpError(400, 'That period has not started');
  if (m.unit === 'done' ? input.done == null : input.actual == null)
    throw new HttpError(400, m.unit === 'done' ? 'Say whether it was done' : 'Enter a figure');

  const s = await getTrackerSettings();
  const [existing] = await db
    .select()
    .from(trackerEntry)
    .where(and(eq(trackerEntry.measureId, id), eq(trackerEntry.periodStart, periodStart)));
  const restate =
    existing &&
    isClosed(periodStart, cadence, now, s.closeAfterHours) &&
    (existing.actual !== input.actual || existing.done !== input.done);
  const values = {
    actual: m.unit === 'done' ? null : input.actual,
    done: m.unit === 'done' ? input.done : null,
    note: input.note,
    verified: input.verified,
    evidence: input.evidence,
    enteredByUserId: actor.id,
    enteredAt: now,
    ...(restate
      ? { restatedAt: now, previousActual: existing.actual ?? (existing.done ? 1 : 0) }
      : {}),
  };
  await db
    .insert(trackerEntry)
    .values({ measureId: id, periodStart, ...values })
    .onConflictDoUpdate({
      target: [trackerEntry.measureId, trackerEntry.periodStart],
      set: values,
    });
}

// Holes for the chase: closed periods of manual measures with no figure, and
// unverified figures, oldest first.
export async function listHoles(actor: Actor, now = new Date()) {
  const board = await getBoard(actor, {}, now);
  return board.measures.flatMap((m) =>
    m.cells
      .filter((c) => c.colour === 'black' || (!c.verified && c.closed))
      .map((c) => ({
        measureId: m.id,
        measure: m.name,
        company: m.company,
        ownerUserId: m.ownerUserId,
        periodStart: c.periodStart,
        kind: c.colour === 'black' ? ('missing' as const) : ('unverified' as const),
      })),
  );
}

export type ImportItem = Omit<MeasureInput, 'projectId' | 'initiativeId' | 'ownerUserId'> & {
  projectKey: string;
  initiative?: string;
  ownerEmail?: string;
};

// Creates measures named by keys. A measure already tracked under the same company
// and name is left alone, so loading a set twice adds nothing. Companies the set names
// are added to the settings.
export async function importMeasures(actor: Actor, items: ImportItem[]) {
  if (!isGod(actor)) throw new HttpError(403, 'Only the instance owner may import measures');
  const s = await getTrackerSettings();
  const companies = [...new Set([...s.companies, ...items.map((i) => i.company.trim())])];
  if (companies.length !== s.companies.length) await setTrackerSettings({ ...s, companies });

  const existing = await db
    .select({ company: trackerMeasure.company, name: trackerMeasure.name })
    .from(trackerMeasure)
    .where(isNull(trackerMeasure.archivedAt));
  const taken = new Set(existing.map((e) => `${e.company}\u0000${e.name}`));
  const created: { id: number; name: string; company: string }[] = [];
  const skipped: { name: string; company: string; reason: string }[] = [];

  for (const item of items) {
    const { projectKey, initiative: initiativeName, ownerEmail, ...rest } = item;
    const skip = (reason: string) =>
      skipped.push({ name: item.name, company: item.company, reason });
    if (taken.has(`${item.company}\u0000${item.name}`)) {
      skip('Already tracked');
      continue;
    }
    const [p] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.key, projectKey))
      .limit(1);
    if (!p) {
      skip(`No project ${projectKey}`);
      continue;
    }
    let initiativeId: number | null = null;
    if (initiativeName) {
      const options = await db
        .select({ id: initiative.id, title: initiative.title })
        .from(initiative)
        .where(eq(initiative.projectId, p.id));
      const match =
        options.find((o) => o.title === initiativeName) ??
        options.find((o) => o.title.startsWith(`${initiativeName} —`)) ??
        options.find((o) => o.title.startsWith(initiativeName));
      if (!match) {
        skip(`No initiative starting "${initiativeName}" in ${projectKey}`);
        continue;
      }
      initiativeId = match.id;
    }
    let ownerUserId: string | null = null;
    if (ownerEmail) {
      const [u] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${ownerEmail.toLowerCase()}`);
      ownerUserId = u?.id ?? null;
    }
    try {
      const res = await createMeasure(actor, {
        ...rest,
        projectId: p.id,
        initiativeId,
        ownerUserId,
      });
      created.push({ id: res.id, name: item.name, company: item.company });
      taken.add(`${item.company}\u0000${item.name}`);
    } catch (err) {
      skip(err instanceof HttpError ? err.message : 'Could not be created');
    }
  }
  return { created, skipped };
}
