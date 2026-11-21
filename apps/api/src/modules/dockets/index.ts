import { Elysia, t } from 'elysia';
import { authContext } from '#shared/auth-context';
import { assertPermission, checkPermission, requireUser, type AuthUser } from '#shared/access';
import { assertProjectReachable, entityGuard, guards, requiresPermission } from '#shared/guards';
import { HttpError } from '#shared/lib';
import { accessErrors, commonErrors, errors } from '#shared/responses';
import { mcpTool } from '#mcp/generate';
import { getIssueProjectId } from '#modules/issues/service';
import {
  DocketResponse,
  RegisterResponse,
  VerifyResponse,
  createSessionDocketBody,
  docketParams,
  issueParams,
  projectParams,
  registerQuery,
  reviewBody,
} from './model';
import { mayReview, reviewDocket } from './review';
import {
  attachDocket,
  createSessionDocket,
  discardDocket,
  docketProjectId,
  getDocket,
  listDockets,
  listProjectDockets,
} from './service';
import { verifyDocket } from './stamp';

async function accessOf(projectId: number, user: AuthUser | null | undefined) {
  const current = requireUser(user);
  return {
    userId: current.id,
    canEdit: await checkPermission(projectId, current, 'work_items', 'edit'),
    mayReview: await mayReview(projectId, current),
  };
}

// Evidence dockets. A session docket comes from the time agent and is stamped when it is
// created. An agent run docket is drafted when the run ends and is stamped when a person
// attaches it. A stamped docket is posted to its issue as a comment, and a complete one
// waits for a lead's review.
export const docketRoutes = new Elysia({ name: 'dockets', detail: { tags: ['Dockets'] } })
  .use(authContext)
  .use(guards)
  .macro({
    docketIssue: entityGuard('work_items', 'Issue not found', (p) =>
      getIssueProjectId(Number(p.issueId)),
    ),
    docket: entityGuard('work_items', 'Docket not found', (p) =>
      docketProjectId(Number(p.docketId)),
    ),
  })
  .get(
    '/issues/:issueId/dockets',
    async ({ params, projectId, user }) =>
      listDockets(params.issueId, await accessOf(projectId, user)),
    {
      params: issueParams,
      docketIssue: 'read',
      response: { 200: t.Array(DocketResponse), ...accessErrors },
      detail: {
        summary: "List an issue's dockets",
        description:
          'Newest first. Stamped dockets are listed to anyone who reads the issue. Drafts and ' +
          'discarded agent run dockets hold agent output nobody approved, so only callers with ' +
          'work_items edit see them.',
        ...mcpTool('list_issue_dockets'),
      },
    },
  )
  .post(
    '/issues/:issueId/dockets',
    async ({ params, body, projectId, user, set }) => {
      const caller = requireUser(user);
      const { id, created } = await createSessionDocket(params.issueId, caller.id, body);
      if (created) set.status = 201;
      return getDocket(id, await accessOf(projectId, caller));
    },
    {
      params: issueParams,
      body: createSessionDocketBody,
      docketIssue: 'edit',
      response: { 200: DocketResponse, 201: DocketResponse, ...commonErrors, ...errors(502) },
      detail: {
        summary: 'Create a work session docket',
        description:
          'Stamps the docket with a number, the server time and a sha256 fingerprint, hashes ' +
          "the bytes of each listed attachment, and posts it to the issue as the caller's " +
          'comment. A complete docket waits for review; a blocked one tells the assignee and ' +
          'the project leads and labels the issue "At risk". A repeat with the same clientKey ' +
          'returns the existing docket with 200.',
        ...mcpTool('create_session_docket'),
      },
    },
  )
  .get(
    '/projects/:projectKey/dockets',
    async ({ project, query, user }) =>
      listProjectDockets(project.id, query, await accessOf(project.id, user)),
    {
      params: projectParams,
      query: registerQuery,
      permission: ['work_items', 'read'],
      response: { 200: RegisterResponse, ...commonErrors },
      detail: {
        summary: "List a project's stamped dockets for a month",
        description:
          'The docket register, newest first. Items leave out the body and the attachments. ' +
          'The counts cover the month and the client filter.',
        ...mcpTool('list_project_dockets'),
      },
    },
  )
  .get(
    '/dockets/:docketId',
    async ({ params, projectId, user }) =>
      getDocket(params.docketId, await accessOf(projectId, user)),
    {
      params: docketParams,
      docket: 'read',
      response: { 200: DocketResponse, ...accessErrors },
      detail: {
        summary: 'Get a docket',
        description: 'A draft or discarded docket needs work_items edit.',
        ...mcpTool('get_docket'),
      },
    },
  )
  .get('/dockets/:docketId/verify', ({ params }) => verifyDocket(params.docketId), {
    params: docketParams,
    docket: 'read',
    response: { 200: VerifyResponse, ...accessErrors, ...errors(409) },
    detail: {
      summary: 'Verify a docket against its fingerprint',
      description:
        'Recomputes the fingerprint and re-reads the bytes of every attachment. "changed" lists ' +
        'what differs from the stamp. An unstamped docket is 409.',
      ...mcpTool('verify_docket'),
    },
  })
  .post(
    '/dockets/:docketId/review',
    async ({ params, body, user, request }) => {
      const caller = requireUser(user);
      const projectId = await docketProjectId(params.docketId);
      if (projectId == null) throw new HttpError(404, 'Docket not found');
      if (caller.role !== 'god') {
        await assertPermission(projectId, caller, 'workflow_config', 'edit');
      }
      await assertProjectReachable(projectId, request);
      await reviewDocket(params.docketId, caller.id, body.decision, body.note);
      return getDocket(params.docketId, await accessOf(projectId, caller));
    },
    {
      params: docketParams,
      body: reviewBody,
      response: { 200: DocketResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Approve or return a docket',
        description:
          'For the instance owner or a member with workflow_config edit. Approve moves the issue ' +
          'to the first completed column and clears "At risk"; return needs a note and moves ' +
          'the issue to the first started column. Both comment on the issue and tell the ' +
          'author. A docket that is not pending review is 409.',
        ...requiresPermission(['workflow_config', 'edit']),
        ...mcpTool('review_docket'),
      },
    },
  )
  .post(
    '/dockets/:docketId/attach',
    async ({ params, projectId, user }) => {
      const caller = requireUser(user);
      await attachDocket(params.docketId, caller.id);
      return getDocket(params.docketId, await accessOf(projectId, caller));
    },
    {
      params: docketParams,
      docket: 'edit',
      response: { 200: DocketResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Attach a docket to its issue',
        description:
          "Stamps the draft and adds it to the issue as the caller's comment; it then waits " +
          'for review. A decided docket is 409.',
        ...mcpTool('attach_docket'),
      },
    },
  )
  .post(
    '/dockets/:docketId/discard',
    async ({ params, projectId, user }) => {
      const caller = requireUser(user);
      await discardDocket(params.docketId, caller.id);
      return getDocket(params.docketId, await accessOf(projectId, caller));
    },
    {
      params: docketParams,
      docket: 'edit',
      response: { 200: DocketResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Discard a docket',
        description:
          'The draft is kept as discarded and never reaches the issue. A decided docket is 409.',
        ...mcpTool('discard_docket'),
      },
    },
  );
