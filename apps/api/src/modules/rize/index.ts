import { Elysia, t } from 'elysia';
import { db, initiative, issue } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { authContext } from '#shared/auth-context';
import { requireGod } from '#shared/access';
import { guards } from '#shared/guards';
import { noContent } from '#shared/http';
import { HttpError } from '#shared/lib';
import { commonErrors, errors } from '#shared/responses';
import { mcpTool } from '#mcp/generate';
import {
  RizeStatusResponse,
  SyncResponse,
  TimeOverviewResponse,
  entryParams,
  linkEntryBody,
  mapClientBody,
  rizeKeyBody,
  timeQuery,
} from './model';
import {
  getRizeStatus,
  getTimeOverview,
  linkEntry,
  mapClient,
  setRizeKey,
  syncRize,
} from './service';

const thisMonth = () => new Date().toISOString().slice(0, 7);

// The Rize connection: instance administration, the god role only.
export const rizeGodRoutes = new Elysia({ name: 'rize-god', detail: { tags: ['Time'] } })
  .use(authContext)
  .onBeforeHandle(({ user }) => {
    requireGod(user);
  })
  .get('/god/rize', () => getRizeStatus(), {
    response: { 200: RizeStatusResponse, ...commonErrors },
    detail: { summary: 'Get the Rize connection' },
  })
  .put('/god/rize', ({ body }) => setRizeKey(body.apiKey), {
    body: rizeKeyBody,
    response: { 200: RizeStatusResponse, ...commonErrors },
    detail: { summary: 'Set the Rize API key' },
  })
  .post('/god/rize/sync', () => syncRize(60), {
    response: { 200: SyncResponse, ...commonErrors, ...errors(409) },
    detail: { summary: 'Sync the last 60 days from Rize' },
  });

// A project's tracked time and its reconciliation with the tickets.
export const timeRoutes = new Elysia({ name: 'time', detail: { tags: ['Time'] } })
  .use(guards)
  .get(
    '/projects/:projectKey/time',
    ({ project, query }) => getTimeOverview(project.id, query.month ?? thisMonth()),
    {
      query: timeQuery,
      permission: ['initiatives', 'read'],
      response: { 200: TimeOverviewResponse, ...commonErrors },
      detail: {
        summary: "Get a project's tracked time",
        description:
          'The month of time tracked in Rize: each client initiative against its monthly ' +
          'limit (flag at 60%, stop at 70%), and the entries not tied to a ticket.',
        ...mcpTool('get_tracked_time'),
      },
    },
  )
  .post(
    '/projects/:projectKey/time/entries/:entryId/link',
    async ({ project, params, body }) => {
      if (body.issueId != null) {
        const [row] = await db
          .select({ id: issue.id })
          .from(issue)
          .where(and(eq(issue.id, body.issueId), eq(issue.projectId, project.id)));
        if (!row) throw new HttpError(400, 'The ticket must belong to this project');
      }
      await linkEntry(params.entryId, body.issueId);
      return noContent();
    },
    {
      params: entryParams,
      body: linkEntryBody,
      permission: ['work_items', 'edit'],
      response: { 204: t.Void(), ...commonErrors },
      detail: {
        summary: 'Tie a time entry to a ticket',
        description: 'Ties a tracked Rize entry to a ticket by hand; later syncs keep the link.',
        ...mcpTool('link_time_entry'),
      },
    },
  )
  .put(
    '/projects/:projectKey/time/clients',
    async ({ project, body }) => {
      if (body.initiativeId != null) {
        const [row] = await db
          .select({ id: initiative.id })
          .from(initiative)
          .where(and(eq(initiative.id, body.initiativeId), eq(initiative.projectId, project.id)));
        if (!row) throw new HttpError(400, 'The initiative must belong to this project');
      }
      await mapClient(body.rizeClient, body.initiativeId);
      return noContent();
    },
    {
      body: mapClientBody,
      permission: ['initiatives', 'edit'],
      response: { 204: t.Void(), ...commonErrors },
      detail: {
        summary: 'Map a Rize client to an initiative',
        description: "Time tracked under the Rize client counts toward the initiative's limit.",
        ...mcpTool('map_rize_client'),
      },
    },
  );
