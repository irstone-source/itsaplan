import { t } from 'elysia';

export const issueParams = t.Object({ issueId: t.Numeric() });
export const docketParams = t.Object({ docketId: t.Numeric() });
export const projectParams = t.Object({ projectKey: t.String() });

const person = t.Nullable(t.Object({ id: t.String(), name: t.String() }));

export const DocketResponse = t.Object({
  id: t.Number(),
  number: t.Nullable(t.String()),
  kind: t.UnionEnum(['session', 'agent']),
  status: t.UnionEnum(['draft', 'attached', 'discarded']),
  outcome: t.Nullable(t.UnionEnum(['complete', 'blocked'])),
  evidence: t.Nullable(t.String()),
  body: t.String(),
  issue: t.Object({
    id: t.Number(),
    identifier: t.String(),
    title: t.String(),
    projectKey: t.String(),
  }),
  client: t.Nullable(t.Object({ id: t.Number(), name: t.String() })),
  author: person,
  device: t.Nullable(t.String()),
  sessionStartedAt: t.Nullable(t.String()),
  sessionEndedAt: t.Nullable(t.String()),
  activeSeconds: t.Nullable(t.Number()),
  attachments: t.Array(
    t.Object({
      publicId: t.String(),
      filename: t.String(),
      contentType: t.String(),
      bytes: t.Number(),
      sha256: t.String(),
      url: t.String(),
    }),
  ),
  fingerprint: t.Nullable(t.String()),
  stampedAt: t.Nullable(t.String()),
  reviewStatus: t.Nullable(t.UnionEnum(['pending', 'approved', 'returned'])),
  reviewer: person,
  reviewedAt: t.Nullable(t.String()),
  reviewNote: t.Nullable(t.String()),
  moved: t.Nullable(
    t.Boolean({
      description: 'Whether the review moved the issue to its column; null until reviewed.',
    }),
  ),
  createdAt: t.String(),
  canReview: t.Boolean({
    description: 'The docket waits for review, the caller may review it and is not its author.',
  }),
});

export const VerifyResponse = t.Object({
  status: t.UnionEnum(['verified', 'changed']),
  checkedAt: t.String(),
  problems: t.Array(t.String()),
});

export const createSessionDocketBody = t.Object({
  clientKey: t.String({
    minLength: 1,
    maxLength: 200,
    description: 'The session id. A repeated create with the same key returns the same docket.',
  }),
  outcome: t.UnionEnum(['complete', 'blocked']),
  evidence: t.String({
    minLength: 1,
    maxLength: 20_000,
    description: 'What shows the work is done, or what blocks it.',
  }),
  body: t.String({ minLength: 1, maxLength: 45_000, description: 'The docket markdown.' }),
  device: t.String({ minLength: 1, maxLength: 200 }),
  sessionStartedAt: t.String({ description: 'ISO 8601' }),
  sessionEndedAt: t.String({ description: 'ISO 8601' }),
  activeSeconds: t.Integer({ minimum: 0 }),
  attachmentIds: t.Array(t.String({ format: 'uuid' }), {
    maxItems: 100,
    description: 'publicIds of attachments on this issue that the docket covers.',
  }),
});

export const reviewBody = t.Object({
  decision: t.UnionEnum(['approve', 'return']),
  note: t.Optional(
    t.String({ maxLength: 2000, description: 'Required when the docket is returned.' }),
  ),
});

export const registerQuery = t.Object({
  month: t.Optional(
    t.String({
      pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$',
      description: 'YYYY-MM, a Europe/London month of the stamp time. Defaults to this month.',
    }),
  ),
  initiativeId: t.Optional(t.Numeric({ description: "The issue's initiative (client)." })),
  // t.Union of literals: a t.UnionEnum query field defaults to its first value when absent.
  outcome: t.Optional(t.Union([t.Literal('complete'), t.Literal('blocked')])),
  review: t.Optional(t.Union([t.Literal('pending'), t.Literal('approved'), t.Literal('returned')])),
});

export const RegisterResponse = t.Object({
  items: t.Array(DocketResponse),
  counts: t.Object({
    approved: t.Number(),
    pending: t.Number(),
    blocked: t.Number(),
    returned: t.Number(),
  }),
});
