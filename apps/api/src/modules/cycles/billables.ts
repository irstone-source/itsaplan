import {
  aiAgent,
  cycle,
  db,
  initiative,
  issue,
  project,
  projectColumn,
  projectMember,
} from '@repo/db';
import { and, asc, count, eq, isNull, notInArray } from 'drizzle-orm';
import { getBillingSettings } from '#modules/settings/service';
import { workingDays } from '#modules/finance/service';

export type BillableKind = 'billable' | 'internal';

export interface BillableIssue {
  id: number;
  identifier: string;
  title: string;
  stateType: string;
  initiativeId: number | null;
  estimateMinutes: number | null;
  valuePence: number | null;
  // Whether valuePence was set by hand rather than worked out from the estimate.
  overridden: boolean;
  kind: BillableKind;
}

export interface BillableGroup {
  initiativeId: number | null;
  title: string;
  kind: BillableKind;
  billingModel: string | null;
  dayRatePence: number | null;
  revenueClass: string | null;
  valuePence: number;
  donePence: number;
  issueCount: number;
}

export type RevenueClass = 'committed' | 'new' | 'management' | 'internal' | 'unclassified';

export interface ClassTotal {
  revenueClass: RevenueClass;
  valuePence: number;
  estimatedMinutes: number;
  issueCount: number;
}

export interface CycleCapacity {
  capacityMinutes: number;
  overridden: boolean;
  reservePercent: number;
  reserveMinutes: number;
  plannedMinutes: number;
  freeMinutes: number;
}

export interface CycleBillables {
  hoursPerDay: number;
  targetPence: number | null;
  internalDayRatePence: number | null;
  totals: {
    billablePence: number;
    billableDonePence: number;
    internalPence: number;
    internalDonePence: number;
    // Billable value less internal cost.
    netPence: number;
    estimatedMinutes: number;
    // Issues that add nothing to the totals: no estimate, or an estimate with no rate.
    unestimated: number;
    unpriced: number;
  };
  groups: BillableGroup[];
  byClass: ClassTotal[];
  capacity: CycleCapacity;
  issues: BillableIssue[];
}

const CLASS_ORDER: RevenueClass[] = ['committed', 'new', 'management', 'internal', 'unclassified'];

// Which revenue a ticket counts toward: its initiative's class, internal work that
// is not management, or unclassified client work.
function classOf(kind: BillableKind, revenueClass: string | null): RevenueClass {
  if (revenueClass === 'management') return 'management';
  if (kind === 'internal') return 'internal';
  return revenueClass === 'committed' || revenueClass === 'new' ? revenueClass : 'unclassified';
}

// The team minutes a cycle offers: its own figure when set, else working days ×
// hours per day × the project's human members (agents excluded).
async function cycleCapacityMinutes(
  c: { projectId: number; startDate: string; endDate: string; capacityMinutes: number | null },
  hoursPerDay: number,
): Promise<{ minutes: number; overridden: boolean }> {
  if (c.capacityMinutes != null) return { minutes: c.capacityMinutes, overridden: true };
  const [members] = await db
    .select({ n: count() })
    .from(projectMember)
    .where(
      and(
        eq(projectMember.projectId, c.projectId),
        notInArray(projectMember.userId, db.select({ id: aiAgent.userId }).from(aiAgent)),
      ),
    );
  return {
    minutes: workingDays(c.startDate, c.endDate) * hoursPerDay * 60 * Number(members?.n ?? 0),
    overridden: false,
  };
}

// The value of an estimate: its days (at hoursPerDay) times the day rate, in pence.
export function valueOf(minutes: number, hoursPerDay: number, dayRatePence: number): number {
  return Math.round((minutes / 60 / hoursPerDay) * dayRatePence);
}

// What the cycle's work is worth once done. An issue on an internal project, or
// under an initiative billed as internal, is costed at the internal day rate and
// comes off the net; any other issue is valued at its initiative's day rate. A value
// set by hand replaces estimate × rate. Canceled and archived issues are left out.
export async function getCycleBillables(cycleId: number): Promise<CycleBillables> {
  const { hoursPerDay, internalDayRatePence, reservePercent = 20 } = await getBillingSettings();
  const [target] = await db
    .select({
      targetPence: cycle.targetPence,
      projectId: cycle.projectId,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      capacityMinutes: cycle.capacityMinutes,
    })
    .from(cycle)
    .where(eq(cycle.id, cycleId));
  const rows = await db
    .select({
      id: issue.id,
      projectKey: project.key,
      sequenceNumber: issue.sequenceNumber,
      title: issue.title,
      stateType: projectColumn.stateType,
      estimateMinutes: issue.estimateMinutes,
      valueOverridePence: issue.valueOverridePence,
      internal: project.internal,
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      billingModel: initiative.billingModel,
      dayRatePence: initiative.dayRatePence,
      revenueClass: initiative.revenueClass,
    })
    .from(issue)
    .innerJoin(project, eq(project.id, issue.projectId))
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .leftJoin(initiative, eq(initiative.id, issue.initiativeId))
    .where(and(eq(issue.cycleId, cycleId), isNull(issue.archivedAt)))
    .orderBy(asc(initiative.title), asc(issue.sequenceNumber));

  const totals = {
    billablePence: 0,
    billableDonePence: 0,
    internalPence: 0,
    internalDonePence: 0,
    netPence: 0,
    estimatedMinutes: 0,
    unestimated: 0,
    unpriced: 0,
  };
  const groups = new Map<string, BillableGroup>();
  const byClass = new Map<RevenueClass, ClassTotal>(
    CLASS_ORDER.map((c) => [
      c,
      { revenueClass: c, valuePence: 0, estimatedMinutes: 0, issueCount: 0 },
    ]),
  );
  const issues: BillableIssue[] = [];

  for (const r of rows) {
    if (r.stateType === 'canceled') continue;
    const kind: BillableKind =
      r.internal || r.billingModel === 'internal' ? 'internal' : 'billable';
    const rate = kind === 'internal' ? internalDayRatePence : r.dayRatePence;
    const overridden = r.valueOverridePence != null;
    const valuePence = overridden
      ? r.valueOverridePence
      : r.estimateMinutes && rate != null
        ? valueOf(r.estimateMinutes, hoursPerDay, rate)
        : null;
    const done = r.stateType === 'completed';

    if (r.estimateMinutes) totals.estimatedMinutes += r.estimateMinutes;
    if (!overridden && !r.estimateMinutes) totals.unestimated++;
    else if (valuePence == null) totals.unpriced++;

    const cls = byClass.get(classOf(kind, r.revenueClass))!;
    cls.issueCount++;
    cls.estimatedMinutes += r.estimateMinutes ?? 0;
    cls.valuePence += valuePence ?? 0;

    const key =
      kind === 'internal' && r.revenueClass !== 'management'
        ? 'internal'
        : String(r.initiativeId ?? 'none');
    let group = groups.get(key);
    if (!group) {
      const pooled = key === 'internal';
      group = {
        initiativeId: pooled ? null : r.initiativeId,
        title: pooled ? 'Internal work' : (r.initiativeTitle ?? 'No initiative'),
        kind,
        billingModel: pooled ? null : r.billingModel,
        dayRatePence: rate,
        revenueClass: pooled ? null : r.revenueClass,
        valuePence: 0,
        donePence: 0,
        issueCount: 0,
      };
      groups.set(key, group);
    }
    group.issueCount++;
    if (valuePence != null) {
      group.valuePence += valuePence;
      if (done) group.donePence += valuePence;
      if (kind === 'internal') {
        totals.internalPence += valuePence;
        if (done) totals.internalDonePence += valuePence;
      } else {
        totals.billablePence += valuePence;
        if (done) totals.billableDonePence += valuePence;
      }
    }

    issues.push({
      id: r.id,
      identifier: `${r.projectKey}-${r.sequenceNumber}`,
      title: r.title,
      stateType: r.stateType,
      initiativeId: r.initiativeId,
      estimateMinutes: r.estimateMinutes,
      valuePence,
      overridden,
      kind,
    });
  }
  totals.netPence = totals.billablePence - totals.internalPence;

  const { minutes: capacityMinutes, overridden } = target
    ? await cycleCapacityMinutes(target, hoursPerDay)
    : { minutes: 0, overridden: false };
  const reserveMinutes = Math.round((capacityMinutes * reservePercent) / 100);

  return {
    hoursPerDay,
    targetPence: target?.targetPence ?? null,
    internalDayRatePence,
    totals,
    groups: [...groups.values()].sort((a, b) => b.valuePence - a.valuePence),
    byClass: [...byClass.values()],
    capacity: {
      capacityMinutes,
      overridden,
      reservePercent,
      reserveMinutes,
      plannedMinutes: totals.estimatedMinutes,
      freeMinutes: capacityMinutes - reserveMinutes - totals.estimatedMinutes,
    },
    issues,
  };
}
