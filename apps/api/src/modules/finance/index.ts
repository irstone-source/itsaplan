import { Elysia } from 'elysia';
import { authContext } from '#shared/auth-context';
import { requireGod } from '#shared/access';
import { errors } from '#shared/responses';
import { FinanceResponse, financeParams, financeQuery, financeYearBody } from './model';
import { getFinance, setFinanceYear } from './service';

// The revenue plan for a year, owner-only: a target spread over the cycles, and each
// month's break-even and pool beside the billings completed in it.
export const financeRoutes = new Elysia({ name: 'finance', detail: { tags: ['Finance'] } })
  .use(authContext)
  .get(
    '/god/finance',
    async ({ user, query }) => {
      requireGod(user);
      return getFinance(query.start);
    },
    {
      query: financeQuery,
      response: { 200: FinanceResponse, ...errors(401, 403) },
      detail: { summary: "Get a year's revenue plan" },
    },
  )
  .put(
    '/god/finance/:start',
    async ({ user, params, body }) => {
      requireGod(user);
      await setFinanceYear(params.start, body.revenueTargetPence, body.projectId);
      return getFinance(params.start);
    },
    {
      params: financeParams,
      body: financeYearBody,
      response: { 200: FinanceResponse, ...errors(400, 401, 403) },
      detail: { summary: "Set a year's revenue target and spread it over the cycles" },
    },
  );
