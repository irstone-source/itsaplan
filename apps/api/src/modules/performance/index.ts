import { Elysia } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireGod, requireUser } from '#shared/access';
import { errors } from '#shared/responses';
import {
  MonthPerformanceResponse,
  MyPerformanceResponse,
  monthParams,
  monthQuery,
  monthSettingsBody,
} from './model';
import { computeMonth, setMonthSettings } from './service';

// The monthly performance share. A member reads only their own figures and the
// team's progress to break-even as a ratio; the instance owner reads and sets
// everything. The split is enforced here, not in the page.
export const performanceRoutes = new Elysia({
  name: 'performance',
  detail: { tags: ['Performance'] },
})
  .use(authContext)
  .get(
    '/performance/me',
    async ({ user, query }) => {
      const me = requireUser(user);
      const month = await computeMonth(query.month);
      const mine = month.people.find((p) => p.userId === me.id);
      return {
        month: month.month,
        breakEvenSet: month.breakEvenPence != null,
        me: {
          billingsPence: mine?.billingsPence ?? 0,
          shareOfBreakEven: mine?.shareOfBreakEven ?? (month.breakEvenPence != null ? 0 : null),
          bonusPence: mine?.bonusPence ?? 0,
          tickets: mine?.tickets ?? [],
        },
        teamProgress: month.team.progress,
      };
    },
    {
      query: monthQuery,
      response: { 200: MyPerformanceResponse, ...errors(401) },
      detail: { summary: 'Get my performance for a month' },
    },
  )
  .get(
    '/god/performance',
    async ({ user, query }) => {
      requireGod(user);
      return computeMonth(query.month);
    },
    {
      query: monthQuery,
      response: { 200: MonthPerformanceResponse, ...errors(401, 403) },
      detail: { summary: "Get the team's performance for a month" },
    },
  )
  .put(
    '/god/performance/:month',
    async ({ user, params, body }) => {
      requireGod(user);
      await setMonthSettings(params.month, body.breakEvenPence, body.poolPercent);
      return computeMonth(params.month);
    },
    {
      params: monthParams,
      body: monthSettingsBody,
      response: { 200: MonthPerformanceResponse, ...errors(400, 401, 403) },
      detail: { summary: "Set a month's break-even and bonus pool" },
    },
  );
