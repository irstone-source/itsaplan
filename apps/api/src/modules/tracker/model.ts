import { t } from 'elysia';

const Kind = t.Union([
  t.Literal('activity'),
  t.Literal('engagement'),
  t.Literal('outcome'),
  t.Literal('guardrail'),
  t.Literal('gate'),
]);
const Unit = t.Union([
  t.Literal('count'),
  t.Literal('money'),
  t.Literal('percent'),
  t.Literal('done'),
]);
const Direction = t.Union([t.Literal('at_least'), t.Literal('at_most')]);
const Cadence = t.Union([t.Literal('week'), t.Literal('month')]);
const Source = t.Union([
  t.Literal('manual'),
  t.Literal('billings'),
  t.Literal('tickets_completed'),
]);
const Day = t.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', description: "'YYYY-MM-DD'." });

// Money values are in pence.
export const TargetRule = t.Union([
  t.Object({ type: t.Literal('fixed'), value: t.Number() }),
  t.Object({ type: t.Literal('linear'), start: t.Number(), step: t.Number() }),
  t.Object({
    type: t.Literal('compounding'),
    start: t.Number(),
    ratePercent: t.Number({ minimum: -100, maximum: 1000 }),
  }),
  t.Object({ type: t.Literal('gate'), start: t.Number(), target: t.Number(), by: Day }),
  t.Object({ type: t.Literal('shelf'), value: t.Number() }),
  t.Object({
    type: t.Literal('leapfrog'),
    start: t.Number(),
    steps: t.Array(t.Object({ from: Day, value: t.Number() }), { maxItems: 52 }),
  }),
  t.Object({ type: t.Literal('finance') }),
]);

export const measureBody = t.Object({
  projectId: t.Integer(),
  initiativeId: t.Nullable(t.Integer()),
  company: t.String({ minLength: 1, maxLength: 80 }),
  loop: t.String({ minLength: 1, maxLength: 40 }),
  name: t.String({ minLength: 1, maxLength: 120 }),
  definition: t.String({ minLength: 1, maxLength: 4000 }),
  kind: Kind,
  unit: Unit,
  direction: Direction,
  cadence: Cadence,
  unlockPeriods: t.Integer({ minimum: 0, maximum: 52 }),
  source: Source,
  ownerUserId: t.Nullable(t.String()),
  startsOn: Day,
  rule: TargetRule,
  reason: t.Optional(t.String({ maxLength: 500 })),
});

export const measurePatch = t.Partial(measureBody);

export const measureParams = t.Object({ measureId: t.Numeric() });
export const entryParams = t.Object({ measureId: t.Numeric(), periodStart: Day });

export const entryBody = t.Object({
  actual: t.Nullable(t.Number()),
  done: t.Nullable(t.Boolean()),
  note: t.String({ maxLength: 2000 }),
  verified: t.Boolean(),
  evidence: t.String({ maxLength: 2000 }),
});

export const boardQuery = t.Object({
  company: t.Optional(t.String()),
  loop: t.Optional(t.String()),
  projectId: t.Optional(t.Numeric()),
  initiativeId: t.Optional(t.Numeric()),
});

const Percent = t.Integer({ minimum: 1, maximum: 200 });
const Streak = t.Integer({ minimum: 1, maximum: 26 });

export const TrackerSettingsSchema = t.Object({
  greenPercent: Percent,
  amberPercent: Percent,
  streaks: t.Object({
    activity: Streak,
    engagement: Streak,
    outcome: Streak,
    guardrail: Streak,
    gate: Streak,
  }),
  smallNumberBelow: t.Number({ minimum: 0, maximum: 1000 }),
  rollingPeriods: t.Integer({ minimum: 1, maximum: 13 }),
  closeAfterHours: t.Integer({ minimum: 0, maximum: 168 }),
  historyPeriods: t.Integer({ minimum: 4, maximum: 52 }),
  maxMeasuresPerInitiative: t.Integer({ minimum: 1, maximum: 20 }),
  loops: t.Array(t.String({ maxLength: 40 }), { minItems: 1, maxItems: 12 }),
  companies: t.Array(t.String({ maxLength: 80 }), { maxItems: 50 }),
  targetSetters: t.Union([t.Literal('owner_only'), t.Literal('measure_owner')]),
  escalateAfterDays: t.Integer({ minimum: 1, maximum: 20 }),
});

const Colour = t.Union([
  t.Literal('green'),
  t.Literal('amber'),
  t.Literal('red'),
  t.Literal('black'),
  t.Literal('grey'),
  t.Literal('open'),
]);

const Cell = t.Object({
  periodStart: t.String(),
  target: t.Nullable(t.Number()),
  actual: t.Nullable(t.Number()),
  done: t.Nullable(t.Boolean()),
  colour: Colour,
  streak: t.Number(),
  focus: t.Boolean(),
  rolling: t.Nullable(t.Object({ actual: t.Number(), target: t.Number() })),
  verified: t.Boolean(),
  restated: t.Boolean(),
  note: t.String(),
  evidence: t.String(),
  closed: t.Boolean(),
});

const Measure = t.Object({
  id: t.Number(),
  projectId: t.Number(),
  projectKey: t.String(),
  initiativeId: t.Nullable(t.Number()),
  initiativeTitle: t.Nullable(t.String()),
  company: t.String(),
  loop: t.String(),
  name: t.String(),
  definition: t.String(),
  kind: Kind,
  unit: Unit,
  direction: Direction,
  cadence: Cadence,
  unlockPeriods: t.Number(),
  source: t.String(),
  ownerUserId: t.Nullable(t.String()),
  ownerName: t.Nullable(t.String()),
  startsOn: t.String(),
  rule: TargetRule,
  targetHistory: t.Array(
    t.Object({
      effectiveFrom: t.String(),
      rule: TargetRule,
      reason: t.String(),
      createdAt: t.String(),
    }),
  ),
  canEnter: t.Boolean(),
  canEdit: t.Boolean(),
  cells: t.Array(Cell),
});

const Counts = t.Object({
  green: t.Number(),
  amber: t.Number(),
  red: t.Number(),
  black: t.Number(),
  grey: t.Number(),
  open: t.Number(),
});

export const BoardResponse = t.Object({
  settings: t.Object({
    loops: t.Array(t.String()),
    companies: t.Array(t.String()),
    greenPercent: t.Number(),
    amberPercent: t.Number(),
    targetSetters: t.String(),
    maxMeasuresPerInitiative: t.Number(),
  }),
  summary: t.Record(t.String(), Counts),
  measures: t.Array(Measure),
});

export const HolesResponse = t.Array(
  t.Object({
    measureId: t.Number(),
    measure: t.String(),
    company: t.String(),
    ownerUserId: t.Nullable(t.String()),
    periodStart: t.String(),
    kind: t.Union([t.Literal('missing'), t.Literal('unverified')]),
  }),
);

export const IdResponse = t.Object({ id: t.Number() });
