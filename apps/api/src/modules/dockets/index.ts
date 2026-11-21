import { Elysia, t } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireUser } from '#shared/access';
import { entityGuard } from '#shared/guards';
import { commonErrors, errors } from '#shared/responses';
import { mcpTool } from '#mcp/generate';
import { getIssueProjectId } from '#modules/issues/service';
import { DocketResponse, docketParams, issueParams } from './model';
import { attachDocket, discardDocket, docketProjectId, listDockets } from './service';

// Agent run dockets: drafted when an agent's run of an issue ends, added to the issue as
// a comment only when a person attaches one.
export const docketRoutes = new Elysia({ name: 'dockets', detail: { tags: ['Dockets'] } })
  .use(authContext)
  .macro({
    docketIssue: entityGuard('work_items', 'Issue not found', (p) =>
      getIssueProjectId(Number(p.issueId)),
    ),
    docket: entityGuard('work_items', 'Docket not found', (p) =>
      docketProjectId(Number(p.docketId)),
    ),
  })
  .get('/issues/:issueId/dockets', ({ params }) => listDockets(params.issueId), {
    params: issueParams,
    docketIssue: 'edit',
    response: { 200: t.Array(DocketResponse), ...commonErrors },
    detail: {
      summary: "List an issue's agent run dockets",
      description:
        'Newest first. A draft waits for a person to attach or discard it. Needs work_items ' +
        'edit: a draft holds agent output nobody has approved, and an attached one is ' +
        'already a comment.',
      ...mcpTool('list_issue_dockets'),
    },
  })
  .post(
    '/dockets/:docketId/attach',
    ({ params, user }) => attachDocket(params.docketId, requireUser(user).id),
    {
      params: docketParams,
      docket: 'edit',
      response: { 200: DocketResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Attach a docket to its issue',
        description:
          "Adds the draft's text to the issue as the caller's comment. A decided docket is 409.",
        ...mcpTool('attach_docket'),
      },
    },
  )
  .post(
    '/dockets/:docketId/discard',
    ({ params, user }) => discardDocket(params.docketId, requireUser(user).id),
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
