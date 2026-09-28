import { t } from 'elysia';

export const todayQuery = t.Object({
  date: t.String({
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: "The viewer's local date, YYYY-MM-DD.",
  }),
});

export const TodayResponse = t.Object({
  date: t.String(),
  items: t.Array(
    t.Object({
      id: t.Number(),
      sequenceNumber: t.Number(),
      title: t.String(),
      priority: t.Nullable(t.String()),
      startDate: t.Nullable(t.String()),
      dueDate: t.Nullable(t.String()),
      stateType: t.String(),
      columnName: t.String(),
      columnColor: t.String(),
      inCurrentCycle: t.Boolean(),
      projectId: t.Number(),
      projectKey: t.String(),
      projectRef: t.String(),
      projectName: t.String(),
      bucket: t.Union([
        t.Literal('overdue'),
        t.Literal('due'),
        t.Literal('started'),
        t.Literal('cycle'),
        t.Literal('scheduled'),
      ]),
    }),
  ),
});
