import { Elysia, t } from 'elysia';
import { noContent } from '#shared/http';
import { mcpTool } from '#mcp/generate';
import { STARTER_MEASURES } from './starter';
import { authContext } from '#shared/auth-context';
import { requireGod, requireUser } from '#shared/access';
import { errors } from '#shared/responses';
import {
  BoardResponse,
  ImportResponse,
  importBody,
  HolesResponse,
  IdResponse,
  TrackerSettingsSchema,
  boardQuery,
  entryBody,
  entryParams,
  measureBody,
  measureParams,
  measurePatch,
} from './model';
import {
  archiveMeasure,
  createMeasure,
  getBoard,
  getTrackerSettings,
  importMeasures,
  listHoles,
  setEntry,
  setTrackerSettings,
  updateMeasure,
} from './service';

// The growth tracker. Members read the measures of their projects; figures are
// entered by a measure's or initiative's owner; targets belong to the target setter
// named in the tracker settings, which the instance owner administers.
export const trackerRoutes = new Elysia({ name: 'tracker', detail: { tags: ['Tracker'] } })
  .use(authContext)
  .get('/tracker', ({ user, query }) => getBoard(requireUser(user), query), {
    query: boardQuery,
    response: { 200: BoardResponse, ...errors(401) },
    detail: { summary: 'Get the growth tracker board', ...mcpTool('get_tracker_board') },
  })
  .get('/tracker/holes', ({ user }) => listHoles(requireUser(user)), {
    response: { 200: HolesResponse, ...errors(401) },
    detail: { summary: 'List missing and unverified figures', ...mcpTool('list_tracker_holes') },
  })
  .post(
    '/tracker/measures',
    async ({ user, body, set }) => {
      const res = await createMeasure(requireUser(user), body);
      set.status = 201;
      return res;
    },
    {
      body: measureBody,
      response: { 201: IdResponse, ...errors(400, 401, 403, 404, 409) },
      detail: { summary: 'Create a measure', ...mcpTool('create_tracker_measure') },
    },
  )
  .patch(
    '/tracker/measures/:measureId',
    ({ user, params, body }) => updateMeasure(requireUser(user), params.measureId, body),
    {
      params: measureParams,
      body: measurePatch,
      response: { 200: IdResponse, ...errors(400, 401, 403, 404) },
      detail: { summary: 'Change a measure or its target', ...mcpTool('update_tracker_measure') },
    },
  )
  .delete(
    '/tracker/measures/:measureId',
    async ({ user, params }) => {
      await archiveMeasure(requireUser(user), params.measureId);
      return noContent();
    },
    {
      params: measureParams,
      response: { 204: t.Void(), ...errors(401, 403, 404) },
      detail: { summary: 'Stop tracking a measure' },
    },
  )
  .put(
    '/tracker/measures/:measureId/entries/:periodStart',
    async ({ user, params, body }) => {
      await setEntry(requireUser(user), params.measureId, params.periodStart, body);
      return noContent();
    },
    {
      params: entryParams,
      body: entryBody,
      response: { 204: t.Void(), ...errors(400, 401, 403, 404) },
      detail: { summary: "Enter a period's figure", ...mcpTool('enter_tracker_figure') },
    },
  )
  .get(
    '/god/tracker',
    ({ user }) => {
      requireGod(user);
      return getTrackerSettings();
    },
    {
      response: { 200: TrackerSettingsSchema, ...errors(401, 403) },
      detail: { summary: 'Get the tracker settings' },
    },
  )
  .put(
    '/god/tracker',
    ({ user, body }) => {
      requireGod(user);
      return setTrackerSettings(body);
    },
    {
      body: TrackerSettingsSchema,
      response: { 200: TrackerSettingsSchema, ...errors(400, 401, 403) },
      detail: { summary: 'Set the tracker settings' },
    },
  )
  .post(
    '/tracker/measures/import',
    ({ user, body }) => importMeasures(requireUser(user), body.measures),
    {
      body: importBody,
      response: { 200: ImportResponse, ...errors(400, 401, 403) },
      detail: {
        summary: 'Import measures named by project key, initiative and owner email',
        ...mcpTool('import_tracker_measures'),
      },
    },
  )
  .post('/god/tracker/starter', ({ user }) => importMeasures(requireUser(user), STARTER_MEASURES), {
    response: { 200: ImportResponse, ...errors(401, 403) },
    detail: { summary: 'Load the starter measures' },
  });
