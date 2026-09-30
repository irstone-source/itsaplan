import { t } from 'elysia';

const Month = t.String({ pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$', description: "'YYYY-MM'." });

export const monthQuery = t.Object({ month: Month });
export const monthParams = t.Object({ month: Month });

export const monthSettingsBody = t.Object({
  breakEvenPence: t.Integer({ minimum: 0, description: 'Break-even for the month, in pence.' }),
  poolPercent: t.Integer({
    minimum: 0,
    maximum: 100,
    description: 'Share of billings above break-even that goes to the bonus pool.',
  }),
});

const Ticket = t.Object({
  id: t.Number(),
  identifier: t.String(),
  title: t.String(),
  valuePence: t.Number(),
});

const Person = t.Object({
  userId: t.String(),
  name: t.String(),
  billingsPence: t.Number(),
  shareOfBreakEven: t.Nullable(t.Number()),
  bonusPence: t.Number(),
  tickets: t.Array(Ticket),
});

const OpenWork = t.Object({ tickets: t.Number(), minutes: t.Number() });

export const MonthPerformanceResponse = t.Object({
  month: t.String(),
  breakEvenPence: t.Nullable(t.Number()),
  poolPercent: t.Number(),
  team: t.Object({
    billingsPence: t.Number(),
    aboveBreakEvenPence: t.Number(),
    poolPence: t.Number(),
    progress: t.Nullable(t.Number()),
  }),
  people: t.Array(Person),
  unlock: t.Object({
    unlocked: t.Boolean(),
    gapPence: t.Nullable(t.Number()),
    hoursNeeded: t.Nullable(t.Number()),
    ticketsNeeded: t.Nullable(t.Number()),
    open: t.Object({ tickets: t.Number(), minutes: t.Number(), valuePence: t.Number() }),
    shortfallPence: t.Number(),
  }),
  openByUser: t.Record(t.String(), OpenWork),
});

// What a team member sees: their own figures, and the team's progress to break-even
// as a ratio only — no amounts but their own.
export const MyPerformanceResponse = t.Object({
  month: t.String(),
  breakEvenSet: t.Boolean(),
  me: t.Object({
    billingsPence: t.Number(),
    shareOfBreakEven: t.Nullable(t.Number()),
    bonusPence: t.Number(),
    tickets: t.Array(Ticket),
  }),
  teamProgress: t.Nullable(t.Number()),
  // What the team still has to do before the bonus opens, in hours and tickets only.
  unlock: t.Object({
    unlocked: t.Boolean(),
    hoursNeeded: t.Nullable(t.Number()),
    ticketsNeeded: t.Nullable(t.Number()),
    enoughPlanned: t.Boolean(),
  }),
  myOpen: OpenWork,
});
