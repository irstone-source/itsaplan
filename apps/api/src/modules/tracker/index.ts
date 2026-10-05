import { Elysia, t } from 'elysia';
import { noContent } from '#shared/http';
import { authContext } from '#shared/auth-context';
import { requireGod, requireUser } from '#shared/access';
import { errors } from '#shared/responses';
import {
  BoardResponse,
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
    detail: { summary: 'Get the growth tracker board' },
  })
  .get('/tracker/holes', ({ user }) => listHoles(requireUser(user)), {
    response: { 200: HolesResponse, ...errors(401) },
    detail: { summary: 'List missing and unverified figures' },
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
      detail: { summary: 'Create a measure' },
    },
  )
  .patch(
    '/tracker/measures/:measureId',
    ({ user, params, body }) => updateMeasure(requireUser(user), params.measureId, body),
    {
      params: measureParams,
      body: measurePatch,
      response: { 200: IdResponse, ...errors(400, 401, 403, 404) },
      detail: { summary: 'Change a measure or its target' },
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
      detail: { summary: "Enter a period's figure" },
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
  );
