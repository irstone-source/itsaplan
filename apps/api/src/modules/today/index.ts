import { Elysia } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireUser } from '#shared/access';
import { errors } from '#shared/responses';
import { TodayResponse, todayQuery } from './model';
import { listToday } from './service';

// Today: the session user's own assigned work across every project they are a
// member of. Scoped to that user, so no project permission is checked.
export const todayRoutes = new Elysia({ name: 'today', detail: { tags: ['Today'] } })
  .use(authContext)
  .get(
    '/today',
    async ({ user, query }) => ({
      date: query.date,
      items: await listToday(requireUser(user).id, query.date),
    }),
    {
      query: todayQuery,
      response: { 200: TodayResponse, ...errors(401) },
      detail: { summary: "List the viewer's work for a day" },
    },
  );
