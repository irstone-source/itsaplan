import { t } from 'elysia';

export const RizeStatusResponse = t.Object({
  configured: t.Boolean(),
  lastSyncAt: t.Nullable(t.String()),
  lastError: t.Nullable(t.String()),
  entries: t.Number(),
});

export const rizeKeyBody = t.Object({
  apiKey: t.String({ description: 'Rize API key (Settings → API); empty disconnects.' }),
});

export const SyncResponse = t.Object({ synced: t.Number(), matched: t.Number() });

export const timeQuery = t.Object({
  month: t.Optional(
    t.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM; default this month.' }),
  ),
});

const TimeState = t.UnionEnum(['none', 'ok', 'flag', 'stop']);

export const TimeOverviewResponse = t.Object({
  month: t.String(),
  clients: t.Array(
    t.Object({
      initiativeId: t.Number(),
      title: t.String(),
      trackedMinutes: t.Number(),
      limitMinutes: t.Nullable(t.Number()),
      // flag at 60% of the limit, stop (down tools) at 70%.
      state: TimeState,
    }),
  ),
  trackedMinutes: t.Number(),
  matchedMinutes: t.Number(),
  unmatched: t.Array(
    t.Object({
      id: t.Number(),
      memberEmail: t.Nullable(t.String()),
      startedAt: t.String(),
      minutes: t.Number(),
      title: t.String(),
      clientName: t.Nullable(t.String()),
      projectName: t.Nullable(t.String()),
      taskName: t.Nullable(t.String()),
      initiativeId: t.Nullable(t.Number()),
    }),
  ),
  rizeClients: t.Array(t.Object({ name: t.String(), initiativeId: t.Nullable(t.Number()) })),
});

export const entryParams = t.Object({ projectKey: t.String(), entryId: t.Numeric() });

export const linkEntryBody = t.Object({
  issueId: t.Nullable(
    t.Integer({ description: 'The ticket the time belongs to, or null to unlink.' }),
  ),
});

export const mapClientBody = t.Object({
  rizeClient: t.String({ minLength: 1 }),
  initiativeId: t.Nullable(t.Integer()),
});
