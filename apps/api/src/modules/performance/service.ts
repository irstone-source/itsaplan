import {
  cycle,
  db,
  initiative,
  issue,
  issueStatus,
  performanceMonth,
  project,
  projectColumn,
  user,
} from '@repo/db';
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
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

// Open billable work planned into the cycles that start in the month.
async function openWork(start: Date, end: Date, hoursPerDay: number) {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const rows = await db
    .select({
      assigneeUserId: issue.assigneeUserId,
      estimateMinutes: issue.estimateMinutes,
      valueOverridePence: issue.valueOverridePence,
      internal: project.internal,
      billingModel: initiative.billingModel,
      dayRatePence: initiative.dayRatePence,
    })
    .from(issue)
    .innerJoin(cycle, eq(cycle.id, issue.cycleId))
    .innerJoin(project, eq(project.id, issue.projectId))
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .leftJoin(initiative, eq(initiative.id, issue.initiativeId))
    .where(
      and(
        isNull(issue.archivedAt),
        gte(cycle.startDate, ymd(start)),
        lt(cycle.startDate, ymd(end)),
        inArray(projectColumn.stateType, ['backlog', 'unstarted', 'started']),
      ),
    );
  return rows.flatMap((r) => {
    if (r.internal || r.billingModel === 'internal') return [];
    const valuePence = ticketValue(r, hoursPerDay);
    return valuePence > 0 ? [{ ...r, valuePence }] : [];
  });
}

function ticketValue(
  r: {
    valueOverridePence: number | null;
    estimateMinutes: number | null;
    dayRatePence: number | null;
  },
  hoursPerDay: number,
): number {
  return (
    r.valueOverridePence ??
    (r.estimateMinutes && r.dayRatePence != null
      ? valueOf(r.estimateMinutes, hoursPerDay, r.dayRatePence)
      : 0)
  );
}

export function unlockFor(
  gapPence: number | null,
  open: { valuePence: number; estimateMinutes: number | null }[],
): Unlock {
  const valuePence = open.reduce((sum, o) => sum + o.valuePence, 0);
  const estimated = open.filter((o) => o.estimateMinutes);
  const minutes = estimated.reduce((sum, o) => sum + o.estimateMinutes!, 0);
  const estimatedValue = estimated.reduce((sum, o) => sum + o.valuePence, 0);
  const gap = gapPence != null && gapPence > 0 ? gapPence : null;
  return {
    unlocked: gapPence != null && gapPence <= 0,
    gapPence: gap,
    // Rounded up to the half hour.
    hoursNeeded: gap && minutes > 0 ? Math.ceil(((gap / estimatedValue) * minutes) / 30) / 2 : null,
    ticketsNeeded: gap && open.length > 0 ? Math.ceil(gap / (valuePence / open.length)) : null,
    open: { tickets: open.length, minutes, valuePence },
    shortfallPence: gap ? Math.max(0, gap - valuePence) : 0,
  };
}

export interface OpenWork {
  tickets: number;
  minutes: number;
}

// What the team still has to bill before the bonus pool opens, and how much of the
// month's planned work that is.
export interface Unlock {
  unlocked: boolean;
  gapPence: number | null;
  // Estimates from the month's open billable tickets: their value per hour, and their
  // average value. Null when there is no gap or no open work to estimate from.
  hoursNeeded: number | null;
  ticketsNeeded: number | null;
  open: OpenWork & { valuePence: number };
  // How much of the gap the open work does not cover.
  shortfallPence: number;
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
  unlock: Unlock;
  // Each person's open billable tickets in the month's cycles, by user id.
  openByUser: Record<string, OpenWork>;
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
    const valuePence = ticketValue(r, hoursPerDay);
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

  const open = await openWork(start, end, hoursPerDay);
  const openByUser: Record<string, OpenWork> = {};
  for (const o of open) {
    if (!o.assigneeUserId) continue;
    const mine = (openByUser[o.assigneeUserId] ??= { tickets: 0, minutes: 0 });
    mine.tickets++;
    mine.minutes += o.estimateMinutes ?? 0;
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
    unlock: unlockFor(breakEvenPence != null ? breakEvenPence - teamPence : null, open),
    openByUser,
  };
}
