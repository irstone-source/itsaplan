import { Elysia, t } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireUser } from '#shared/access';
import { noContent } from '#shared/http';
import { guards } from '#shared/guards';
import { HttpError } from '#shared/lib';
import { commonErrors } from '#shared/responses';
import { mcpTool } from '#mcp/generate';
import {
  ImportPlaybookResponse,
  PlaybookItemResponse,
  importPlaybookBody,
  PlaybookResponse,
  createPlaybookItemBody,
  playbookParams,
  updatePlaybookItemBody,
} from './model';
import {
  createPlaybookItem,
  deletePlaybookItem,
  listPlaybook,
  updatePlaybookItem,
} from './service';
import { importPlaybook } from './import';

export const playbookRoutes = new Elysia({ name: 'playbook', detail: { tags: ['Playbook'] } })
  .use(authContext)
  .use(guards)
  .get('/projects/:projectKey/playbook', ({ project }) => listPlaybook(project.id), {
    permission: ['initiatives', 'read'],
    response: { 200: PlaybookResponse, ...commonErrors },
    detail: {
      summary: "List a project's playbook",
      description:
        'The repeatable deliverables of each client initiative: outcome price, billing ' +
        '(billable, retainer, non_billable), cadence and estimate. Each group shows what ' +
        'its items are priced at per month against the initiative monthly fee.',
      ...mcpTool('list_playbook'),
    },
  })

  .post(
    '/projects/:projectKey/playbook',
    async ({ project, body, set }) => {
      set.status = 201;
      return createPlaybookItem(project.id, body);
    },
    {
      body: createPlaybookItemBody,
      permission: ['initiatives', 'create'],
      response: { 201: PlaybookItemResponse, ...commonErrors },
      detail: {
        summary: 'Create a playbook item',
        description: 'Add a repeatable deliverable to a client initiative.',
        ...mcpTool('create_playbook_item'),
      },
    },
  )

  .post(
    '/projects/:projectKey/playbook/import',
    ({ project, body, user }) => importPlaybook(project.id, body, requireUser(user).id),
    {
      body: importPlaybookBody,
      permission: ['initiatives', 'create'],
      response: { 200: ImportPlaybookResponse, ...commonErrors },
      detail: {
        summary: 'Import a playbook',
        description:
          'Load playbook items from spreadsheet rows (client, deliverable, price, billing, ' +
          'cadence, quarter month, estimate hours). With setup, also the revenue classes, ' +
          'the MGM consulting-management initiative and its items, and a quarterly review per ' +
          'committed client. Items already in the playbook are skipped. apply false only ' +
          'reports what would happen.',
        ...mcpTool('import_playbook'),
      },
    },
  )

  .patch(
    '/projects/:projectKey/playbook/:itemId',
    async ({ project, params, body }) => {
      const item = await updatePlaybookItem(project.id, params.itemId, body);
      if (!item) throw new HttpError(404, 'Playbook item not found');
      return item;
    },
    {
      body: updatePlaybookItemBody,
      params: playbookParams,
      permission: ['initiatives', 'edit'],
      response: { 200: PlaybookItemResponse, ...commonErrors },
      detail: {
        summary: 'Update a playbook item',
        description:
          'A property left out of the body keeps its value; `labelIds` replaces the whole set.',
        ...mcpTool('update_playbook_item'),
      },
    },
  )

  .delete(
    '/projects/:projectKey/playbook/:itemId',
    async ({ project, params }) => {
      if (!(await deletePlaybookItem(project.id, params.itemId)))
        throw new HttpError(404, 'Playbook item not found');
      return noContent();
    },
    {
      params: playbookParams,
      permission: ['initiatives', 'delete'],
      response: { 204: t.Void(), ...commonErrors },
      detail: {
        summary: 'Delete a playbook item',
        description: 'Issues already created from it keep their value and lose the link.',
        ...mcpTool('delete_playbook_item'),
      },
    },
  );
