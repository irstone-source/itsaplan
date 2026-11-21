import { Elysia, t } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireUser } from '#shared/access';
import { guards } from '#shared/guards';
import { noContent } from '#shared/http';
import { commonErrors, errors } from '#shared/responses';
import { mcpTool } from '#mcp/generate';
import {
  ConfirmDayResponse,
  DeviceResponse,
  MyDayResponse,
  MyStatusResponse,
  SplitResponse,
  TeamTimeResponse,
  TimeBlockResponse,
  TimeRuleResponse,
  UploadResponse,
  allocateBody,
  blockParams,
  captureBody,
  confirmDayBody,
  createRuleBody,
  dayQuery,
  heartbeatBody,
  projectRuleParams,
  ruleParams,
  splitBody,
  uploadBlocksBody,
} from './model';
import {
  allocate,
  captureTask,
  confirmDay,
  createRule,
  deleteRule,
  getMyDay,
  getMyStatus,
  getTeamTime,
  heartbeat,
  listRules,
  promoteRule,
  splitBlock,
  uploadBlocks,
} from './service';
import { londonDate } from './london';

const yesterday = () => londonDate(new Date(Date.now() - 86_400_000));

// Time capture: the agent's uploads, the person's review of their own blocks, and
// the team view for project owners. A block or rule is its person's alone, so the
// /me routes check nothing beyond the session.
export const timecapRoutes = new Elysia({ name: 'timecap', detail: { tags: ['Time capture'] } })
  .use(authContext)
  .post('/time/agent/heartbeat', ({ user, body }) => heartbeat(requireUser(user).id, body), {
    body: heartbeatBody,
    response: { 200: DeviceResponse, ...errors(400, 401) },
    detail: { summary: 'Report a device of the time capture agent' },
  })
  .post(
    '/time/agent/blocks',
    ({ user, body }) => uploadBlocks(requireUser(user), body.device, body.blocks),
    {
      body: uploadBlocksBody,
      response: { 200: UploadResponse, ...errors(400, 401) },
      detail: {
        summary: 'Upload activity blocks',
        description:
          'Upserts by sourceKey. A confirmed or ignored block is never changed; a pending ' +
          'one takes the new facts and a fresh suggestion. A block with issueId is stored ' +
          'confirmed to that ticket and logged on it; it is skipped when the caller cannot ' +
          'edit the ticket, and stored pending when its week has closed.',
      },
    },
  )
  .get('/me/time', ({ user, query }) => getMyDay(requireUser(user), query.date ?? yesterday()), {
    query: dayQuery,
    response: { 200: MyDayResponse, ...errors(400, 401) },
    detail: {
      summary: "Get the viewer's captured time for a day",
      description:
        "The day's blocks (Europe/London), each with its suggested ticket or client and " +
        'its allocation, the totals, and the devices the agent reports from. Defaults to yesterday.',
      ...mcpTool('get_my_time'),
    },
  })
  .get('/me/time/status', ({ user }) => getMyStatus(requireUser(user).id), {
    response: { 200: MyStatusResponse, ...errors(401) },
    detail: {
      summary: 'Whether a device of the viewer was seen in the last 24 hours',
      description: 'Also when the newest block arrived.',
    },
  })
  .post(
    '/me/time/blocks/:blockId',
    ({ user, params, body }) => allocate(requireUser(user), params.blockId, body),
    {
      params: blockParams,
      body: allocateBody,
      response: { 200: TimeBlockResponse, ...commonErrors },
      detail: {
        summary: 'Confirm, ignore or reset a block',
        description:
          'confirm takes the ticket and initiative given, else the suggestion, and logs the ' +
          'time on the ticket. remember also makes a personal rule from the block. A block ' +
          'of a past week is locked (403).',
        ...mcpTool('allocate_time_block'),
      },
    },
  )
  .post(
    '/me/time/blocks/:blockId/split',
    ({ user, params, body }) => splitBlock(requireUser(user), params.blockId, body.at),
    {
      params: blockParams,
      body: splitBody,
      response: { 200: SplitResponse, ...commonErrors },
      detail: {
        summary: 'Split a block at a time inside it',
        ...mcpTool('split_time_block'),
      },
    },
  )
  .post(
    '/me/time/blocks/:blockId/capture',
    ({ user, params, body }) => captureTask(requireUser(user), params.blockId, body),
    {
      params: blockParams,
      body: captureBody,
      response: { 200: TimeBlockResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Create a ticket from a block',
        description:
          'Creates the ticket in the project, assigned to the viewer, and confirms the block to it.',
        ...mcpTool('capture_task_from_time'),
      },
    },
  )
  .post(
    '/me/time/confirm-day',
    ({ user, body }) => confirmDay(requireUser(user), body.date, body.minConfidence),
    {
      body: confirmDayBody,
      response: { 200: ConfirmDayResponse, ...errors(400, 401) },
      detail: {
        summary: "Confirm a day's confident suggestions",
        description:
          'Confirms every pending block of the day suggested at minConfidence (85) or above.',
        ...mcpTool('confirm_my_day'),
      },
    },
  )
  .get('/me/time/rules', ({ user }) => listRules(requireUser(user).id), {
    response: { 200: t.Array(TimeRuleResponse), ...errors(401) },
    detail: {
      summary: "List the viewer's time rules",
      description: "The viewer's own rules and the team's, which are read-only here.",
      ...mcpTool('list_time_rules'),
    },
  })
  .post(
    '/me/time/rules',
    async ({ user, body, set }) => {
      set.status = 201;
      return createRule(requireUser(user), body);
    },
    {
      body: createRuleBody,
      response: { 201: TimeRuleResponse, ...errors(400, 401) },
      detail: {
        summary: 'Add a personal time rule',
        description:
          'A block whose field contains the pattern is suggested the ticket or initiative, or ignored.',
        ...mcpTool('add_time_rule'),
      },
    },
  )
  .delete(
    '/me/time/rules/:ruleId',
    async ({ user, params }) => {
      await deleteRule(requireUser(user).id, params.ruleId);
      return noContent();
    },
    {
      params: ruleParams,
      response: { 204: t.Void(), ...errors(400, 401, 404) },
      detail: { summary: 'Delete a personal time rule' },
    },
  );

// The team's time capture, for the project's owners.
export const timecapTeamRoutes = new Elysia({
  name: 'timecap-team',
  detail: { tags: ['Time capture'] },
})
  .use(authContext)
  .use(guards)
  .get('/projects/:projectKey/time/team', ({ project }) => getTeamTime(project.id), {
    projectOwner: true,
    response: { 200: TeamTimeResponse, ...commonErrors },
    detail: {
      summary: "List the project members' time capture",
      description: 'Each member, their devices, and their confirmed and pending seconds this week.',
    },
  })
  .post(
    '/projects/:projectKey/time/rules/:ruleId/promote',
    ({ project, user, params }) => promoteRule(project.id, requireUser(user).id, params.ruleId),
    {
      params: projectRuleParams,
      projectOwner: true,
      response: { 200: TimeRuleResponse, ...commonErrors },
      detail: {
        summary: 'Make one of your rules a team rule',
        description: "The rule's ticket or initiative must belong to this project.",
      },
    },
  );
