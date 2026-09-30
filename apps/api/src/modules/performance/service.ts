import { db, initiative, issue, issueStatus, performanceMonth, project, user } from '@repo/db';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { getBillingSettings } from '#modules/settings/service';
import { valueOf } from '#modules/cycles/billables';

export interface PerformanceTicket {
  id: number;
  identifier: string;
  title: string;
  valuePence: number;
}

export interface PersonPerformance {
  userId: string;
  name: string;
  billingsPence: number;
  // Billings as a share of the month's break-even (0.5 = half of it), null when no
  // break-even is set.
  shareOfBreakEven: number | null;
  bonusPence: number;
  tickets: PerformanceTicket[];
}

export interface MonthPerformance {
  month: string;
  breakEvenPence: number | null;
  poolPercent: number;
  team: {
    billingsPence: number;
    aboveBreakEvenPence: number;
    poolPence: number;
    // Team billings over break-even, null when no break-even is set.
    progress: number | null;
  };
  people: PersonPerformance[];
}

function monthRange(month: string): [Date, Date] {
  const [y, m] = month.split('-').map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 1))];
}

export async function getMonthSettings(month: string) {
  const [row] = await db.select().from(performanceMonth).where(eq(performanceMonth.month, month));
  return row ?? null;
}

export async function setMonthSettings(month: string, breakEvenPence: number, poolPercent: number) {
  await db
    .insert(performanceMonth)
    .values({ month, breakEvenPence, poolPercent })
    .onConflictDoUpdate({
      target: performanceMonth.month,
      set: { breakEvenPence, poolPercent, updatedAt: sql`now()` },
    });
}

// A month's performance share. Billings are the value of the client work completed
// in the month (the issue's current stretch in a completed column began in it),
// credited to its assignee: the value set by hand, or estimate in days × the
// initiative's day rate. Internal work is a cost and is left out. Archived issues
// still count: the work was done. The pool is poolPercent of team billings above
// break-even, shared by each person's part of team billings. Completed work with no
// assignee counts toward the team but is paid to no one.
export async function computeMonth(month: string): Promise<MonthPerformance> {
  const [start, end] = monthRange(month);
  const [{ hoursPerDay }, settings] = await Promise.all([
    getBillingSettings(),
    getMonthSettings(month),
  ]);

  const rows = await db
    .select({
      id: issue.id,
      projectKey: project.key,
      sequenceNumber: issue.sequenceNumber,
      title: issue.title,
      assigneeUserId: issue.assigneeUserId,
      assigneeName: user.name,
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
    .leftJoin(user, eq(user.id, issue.assigneeUserId))
    .where(
      and(
        isNull(issueStatus.leftAt),
        eq(issueStatus.stateType, 'completed'),
        gte(issueStatus.enteredAt, start),
        lt(issueStatus.enteredAt, end),
      ),
    );

  let teamPence = 0;
  const people = new Map<string, PersonPerformance>();
  for (const r of rows) {
    if (r.internal || r.billingModel === 'internal') continue;
    const valuePence =
      r.valueOverridePence ??
      (r.estimateMinutes && r.dayRatePence != null
        ? valueOf(r.estimateMinutes, hoursPerDay, r.dayRatePence)
        : 0);
    if (valuePence <= 0) continue;
    teamPence += valuePence;
    if (!r.assigneeUserId) continue;
    let person = people.get(r.assigneeUserId);
    if (!person) {
      person = {
        userId: r.assigneeUserId,
        name: r.assigneeName ?? '',
        billingsPence: 0,
        shareOfBreakEven: null,
        bonusPence: 0,
        tickets: [],
      };
      people.set(r.assigneeUserId, person);
    }
    person.billingsPence += valuePence;
    person.tickets.push({
      id: r.id,
      identifier: `${r.projectKey}-${r.sequenceNumber}`,
      title: r.title,
      valuePence,
    });
  }

  const breakEvenPence = settings?.breakEvenPence ?? null;
  const poolPercent = settings?.poolPercent ?? 0;
  const aboveBreakEvenPence = breakEvenPence != null ? Math.max(0, teamPence - breakEvenPence) : 0;
  const poolPence = Math.round((aboveBreakEvenPence * poolPercent) / 100);
  for (const p of people.values()) {
    p.shareOfBreakEven = breakEvenPence ? p.billingsPence / breakEvenPence : null;
    p.bonusPence = teamPence > 0 ? Math.round((poolPence * p.billingsPence) / teamPence) : 0;
  }

  return {
    month,
    breakEvenPence,
    poolPercent,
    team: {
      billingsPence: teamPence,
      aboveBreakEvenPence,
      poolPence,
      progress: breakEvenPence ? teamPence / breakEvenPence : null,
    },
    people: [...people.values()].sort((a, b) => b.billingsPence - a.billingsPence),
  };
}
