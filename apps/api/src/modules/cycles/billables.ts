import { db, initiative, issue, project, projectColumn } from '@repo/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getBillingSettings } from '#modules/settings/service';

export type BillableKind = 'billable' | 'internal';

export interface BillableIssue {
  id: number;
  identifier: string;
  title: string;
  stateType: string;
  initiativeId: number | null;
  estimateMinutes: number | null;
  valuePence: number | null;
  kind: BillableKind;
}

export interface BillableGroup {
  initiativeId: number | null;
  title: string;
  kind: BillableKind;
  billingModel: string | null;
  dayRatePence: number | null;
  valuePence: number;
  donePence: number;
  issueCount: number;
}

export interface CycleBillables {
  hoursPerDay: number;
  internalDayRatePence: number | null;
  totals: {
    billablePence: number;
    billableDonePence: number;
    internalPence: number;
    internalDonePence: number;
    estimatedMinutes: number;
    // Issues that add nothing to the totals: no estimate, or an estimate with no rate.
    unestimated: number;
    unpriced: number;
  };
  groups: BillableGroup[];
  issues: BillableIssue[];
}

// The value of an estimate: its days (at hoursPerDay) times the day rate, in pence.
export function valueOf(minutes: number, hoursPerDay: number, dayRatePence: number): number {
  return Math.round((minutes / 60 / hoursPerDay) * dayRatePence);
}

// What the cycle's work is worth once done. An issue on an internal project is
// costed at the internal day rate; any other issue is valued at its initiative's
// day rate. Canceled and archived issues are left out.
export async function getCycleBillables(cycleId: number): Promise<CycleBillables> {
  const { hoursPerDay, internalDayRatePence } = await getBillingSettings();
  const rows = await db
    .select({
      id: issue.id,
      projectKey: project.key,
      sequenceNumber: issue.sequenceNumber,
      title: issue.title,
      stateType: projectColumn.stateType,
      estimateMinutes: issue.estimateMinutes,
      internal: project.internal,
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      billingModel: initiative.billingModel,
      dayRatePence: initiative.dayRatePence,
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
    estimatedMinutes: 0,
    unestimated: 0,
    unpriced: 0,
  };
  const groups = new Map<string, BillableGroup>();
  const issues: BillableIssue[] = [];

  for (const r of rows) {
    if (r.stateType === 'canceled') continue;
    const kind: BillableKind = r.internal ? 'internal' : 'billable';
    const rate = r.internal ? internalDayRatePence : r.dayRatePence;
    const valuePence =
      r.estimateMinutes && rate != null ? valueOf(r.estimateMinutes, hoursPerDay, rate) : null;
    const done = r.stateType === 'completed';

    if (!r.estimateMinutes) totals.unestimated++;
    else {
      totals.estimatedMinutes += r.estimateMinutes;
      if (valuePence == null) totals.unpriced++;
    }

    const key = kind === 'internal' ? 'internal' : String(r.initiativeId ?? 'none');
    let group = groups.get(key);
    if (!group) {
      group = {
        initiativeId: kind === 'internal' ? null : r.initiativeId,
        title: kind === 'internal' ? 'Internal work' : (r.initiativeTitle ?? 'No initiative'),
        kind,
        billingModel: kind === 'internal' ? null : r.billingModel,
        dayRatePence: rate,
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
      kind,
    });
  }

  return {
    hoursPerDay,
    internalDayRatePence,
    totals,
    groups: [...groups.values()].sort((a, b) => b.valuePence - a.valuePence),
    issues,
  };
}
