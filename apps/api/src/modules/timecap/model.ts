import { t } from 'elysia';

// The request and response shapes of time capture. The agent (packages/time-agent)
// and the web client (apps/web lib/api/endpoints/timecap.ts) follow these.

const Platform = t.UnionEnum(['darwin', 'win32', 'linux']);
const Source = t.UnionEnum(['activity', 'call', 'manual']);
const RuleField = t.UnionEnum(['app', 'title', 'domain', 'contact']);
const IsoDay = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: "'YYYY-MM-DD'" });

// ── Agent ──────────────────────────────────────────────────────────────────

export const heartbeatBody = t.Object({
  device: t.String({ minLength: 1, maxLength: 120 }),
  platform: Platform,
  version: t.String({ maxLength: 40 }),
  // Whether ActivityWatch answered the agent.
  awOk: t.Boolean(),
});

export const uploadBlocksBody = t.Object({
  device: t.String({ minLength: 1, maxLength: 120 }),
  blocks: t.Array(
    t.Object({
      // Stable per block across syncs: sha256 of device|app|title|start minute.
      sourceKey: t.String({ minLength: 8, maxLength: 128 }),
      source: Source,
      startedAt: t.String({ description: 'ISO 8601' }),
      endedAt: t.String({ description: 'ISO 8601' }),
      app: t.String({ maxLength: 200 }),
      title: t.String({ maxLength: 500 }),
      domain: t.Nullable(t.String({ maxLength: 253 })),
      // Call blocks: { direction: 'in' | 'out', contact: string | null, number: string }.
      detail: t.Optional(t.Record(t.String(), t.Any())),
    }),
    { maxItems: 2000 },
  ),
});

export const UploadResponse = t.Object({
  inserted: t.Number(),
  updated: t.Number(),
  skipped: t.Number(),
});

// ── The person ─────────────────────────────────────────────────────────────

export const dayQuery = t.Object({ date: t.Optional(IsoDay) });

const IssueRef = t.Object({
  id: t.Number(),
  identifier: t.String(),
  title: t.String(),
  projectKey: t.String(),
});
const InitiativeRef = t.Object({ id: t.Number(), title: t.String() });

export const TimeBlockResponse = t.Object({
  id: t.Number(),
  device: t.String(),
  source: t.String(),
  startedAt: t.String(),
  endedAt: t.String(),
  seconds: t.Number(),
  app: t.String(),
  title: t.String(),
  domain: t.Nullable(t.String()),
  detail: t.Record(t.String(), t.Any()),
  status: t.String(),
  issue: t.Nullable(IssueRef),
  initiative: t.Nullable(InitiativeRef),
  suggestion: t.Nullable(
    t.Object({
      issue: t.Nullable(IssueRef),
      initiative: t.Nullable(InitiativeRef),
      confidence: t.Number(),
      reason: t.String(),
    }),
  ),
  // A block of a past week is read-only to its person.
  locked: t.Boolean(),
});

export const DeviceResponse = t.Object({
  name: t.String(),
  platform: t.String(),
  agentVersion: t.Nullable(t.String()),
  trackerOk: t.Boolean(),
  lastSeenAt: t.String(),
});

export const MyDayResponse = t.Object({
  date: t.String(),
  blocks: t.Array(TimeBlockResponse),
  totals: t.Object({
    capturedSeconds: t.Number(),
    confirmedSeconds: t.Number(),
    pendingSeconds: t.Number(),
    ignoredSeconds: t.Number(),
    // Pending blocks "Confirm suggested" would confirm (confidence >= 85).
    confidentPending: t.Number(),
  }),
  devices: t.Array(DeviceResponse),
});

export const blockParams = t.Object({ blockId: t.Numeric() });

export const allocateBody = t.Object({
  action: t.Union([t.Literal('confirm'), t.Literal('ignore'), t.Literal('reset')]),
  // confirm: the ticket and/or initiative; omitted → the suggestion.
  issueId: t.Optional(t.Nullable(t.Integer())),
  initiativeId: t.Optional(t.Nullable(t.Integer())),
  // Also create a personal rule from this block (domain, else app + a title word).
  remember: t.Optional(t.Boolean()),
});

export const splitBody = t.Object({ at: t.String({ description: 'ISO time inside the block' }) });

export const captureBody = t.Object({
  projectKey: t.String(),
  title: t.String({ minLength: 1, maxLength: 300 }),
  initiativeId: t.Optional(t.Nullable(t.Integer())),
});

export const confirmDayBody = t.Object({
  date: IsoDay,
  minConfidence: t.Optional(t.Integer({ minimum: 0, maximum: 100 })),
});

export const ConfirmDayResponse = t.Object({ confirmed: t.Number() });

export const TimeRuleResponse = t.Object({
  id: t.Number(),
  // null: a team rule.
  personal: t.Boolean(),
  field: t.String(),
  pattern: t.String(),
  issue: t.Nullable(IssueRef),
  initiative: t.Nullable(InitiativeRef),
  ignore: t.Boolean(),
  hits: t.Number(),
});

export const createRuleBody = t.Object({
  field: RuleField,
  pattern: t.String({ minLength: 2, maxLength: 200 }),
  issueId: t.Optional(t.Nullable(t.Integer())),
  initiativeId: t.Optional(t.Nullable(t.Integer())),
  ignore: t.Optional(t.Boolean()),
});

export const ruleParams = t.Object({ ruleId: t.Numeric() });

export const MyStatusResponse = t.Object({
  // A device seen in the last 24 hours.
  active: t.Boolean(),
  devices: t.Array(DeviceResponse),
});

// ── The team ───────────────────────────────────────────────────────────────

export const TeamTimeResponse = t.Array(
  t.Object({
    userId: t.String(),
    name: t.String(),
    devices: t.Array(DeviceResponse),
    confirmedSecondsThisWeek: t.Number(),
    pendingSecondsThisWeek: t.Number(),
  }),
);

export const projectRuleParams = t.Object({ projectKey: t.String(), ruleId: t.Numeric() });
