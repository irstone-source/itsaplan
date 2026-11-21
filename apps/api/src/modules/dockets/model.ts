import { t } from 'elysia';

export const issueParams = t.Object({ issueId: t.Numeric() });
export const docketParams = t.Object({ docketId: t.Numeric() });

export const DocketResponse = t.Object({
  id: t.Number(),
  issueId: t.Number(),
  agentRunId: t.Nullable(t.Number()),
  status: t.UnionEnum(['draft', 'attached', 'discarded']),
  body: t.String(),
  createdAt: t.String(),
  decidedByUserId: t.Nullable(t.String()),
  decidedAt: t.Nullable(t.String()),
});
