import { cycle, db, financeYear, performanceMonth, project } from '@repo/db';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { computeMonth } from '#modules/performance/service';

function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

// Monday to Friday between two 'YYYY-MM-DD' dates, both included. Bank holidays count.
export function workingDays(startDate: string, endDate: string): number {
  let n = 0;
  for (
    let d = new Date(`${startDate}T00:00:00Z`);
    d <= new Date(`${endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// Splits total over the weights; the last share takes the rounding remainder, so the
// shares add up to total exactly.
export function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  shares[shares.length - 1] += total - shares.reduce((a, b) => a + b, 0);
  return shares;
}

// The first cycle of the project starting in each month of the year.
async function cyclesByMonth(projectId: number, startMonth: string) {
  const rows = await db
    .select()
    .from(cycle)
    .where(
      and(
        eq(cycle.projectId, projectId),
        gte(cycle.startDate, `${startMonth}-01`),
        lt(cycle.startDate, `${addMonths(startMonth, 12)}-01`),
      ),
    )
    .orderBy(asc(cycle.startDate));
  const byMonth = new Map<string, (typeof rows)[number]>();
  for (const c of rows) {
    const month = c.startDate.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, c);
  }
  return byMonth;
}

export async function getFinance(start?: string) {
  let startMonth = start;
  if (!startMonth) {
    const [latest] = await db
      .select({ startMonth: financeYear.startMonth })
      .from(financeYear)
      .orderBy(desc(financeYear.startMonth))
      .limit(1);
    startMonth = latest?.startMonth ?? new Date().toISOString().slice(0, 7);
  }
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startMonth, i));

  const [[year], projects, settings] = await Promise.all([
    db.select().from(financeYear).where(eq(financeYear.startMonth, startMonth)),
    db
      .select({ id: project.id, key: project.key, name: project.name })
      .from(project)
      .where(eq(project.internal, false))
      .orderBy(asc(project.key)),
    db.select().from(performanceMonth).where(inArray(performanceMonth.month, months)),
  ]);
  const cycles = year?.projectId ? await cyclesByMonth(year.projectId, startMonth) : new Map();
  const billings = await Promise.all(months.map((m) => computeMonth(m)));

  return {
    startMonth,
    revenueTargetPence: year?.revenueTargetPence ?? null,
    projectId: year?.projectId ?? null,
    projects,
    months: months.map((month, i) => {
      const c = cycles.get(month);
      const s = settings.find((r) => r.month === month);
      return {
        month,
        cycle: c
          ? {
              id: c.id,
              name: c.name,
              startDate: c.startDate,
              endDate: c.endDate,
              workingDays: workingDays(c.startDate, c.endDate),
              targetPence: c.targetPence,
            }
          : null,
        breakEvenPence: s?.breakEvenPence ?? null,
        poolPercent: s?.poolPercent ?? 0,
        billingsPence: billings[i].team.billingsPence,
      };
    }),
  };
}

// Saves the year and writes each cycle's target: the year's target split by the
// cycles' working days.
export async function setFinanceYear(
  startMonth: string,
  revenueTargetPence: number,
  projectId: number,
) {
  const cycles = [...(await cyclesByMonth(projectId, startMonth)).values()];
  const targets = spread(
    revenueTargetPence,
    cycles.map((c) => workingDays(c.startDate, c.endDate)),
  );
  await db.transaction(async (tx) => {
    await tx
      .insert(financeYear)
      .values({ startMonth, revenueTargetPence, projectId })
      .onConflictDoUpdate({
        target: financeYear.startMonth,
        set: { revenueTargetPence, projectId, updatedAt: sql`now()` },
      });
    for (const [i, c] of cycles.entries()) {
      await tx
        .update(cycle)
        .set({ targetPence: targets[i], updatedAt: sql`now()` })
        .where(eq(cycle.id, c.id));
    }
  });
}
