import { t } from 'elysia';

const Month = t.String({ pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$', description: "'YYYY-MM'." });

export const financeQuery = t.Object({
  start: t.Optional(Month),
});
export const financeParams = t.Object({ start: Month });

export const financeYearBody = t.Object({
  revenueTargetPence: t.Integer({
    minimum: 0,
    description: 'Revenue target for the year, in pence.',
  }),
  projectId: t.Integer({ description: 'The project whose cycles carry the monthly targets.' }),
});

const Cycle = t.Object({
  id: t.Number(),
  name: t.String(),
  startDate: t.String(),
  endDate: t.String(),
  workingDays: t.Number(),
  targetPence: t.Nullable(t.Number()),
});

export const FinanceResponse = t.Object({
  startMonth: t.String(),
  revenueTargetPence: t.Nullable(t.Number()),
  projectId: t.Nullable(t.Number()),
  projects: t.Array(t.Object({ id: t.Number(), key: t.String(), name: t.String() })),
  months: t.Array(
    t.Object({
      month: t.String(),
      cycle: t.Nullable(Cycle),
      breakEvenPence: t.Nullable(t.Number()),
      poolPercent: t.Number(),
      billingsPence: t.Number(),
    }),
  ),
});
