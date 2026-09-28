import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { bucketOf } from '../../service';

const DATE = '2026-09-28';

describe('today', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lists my open assigned work for the day, bucketed', async () => {
    const u = await signUpTestUser();
    const api = authedApi(u.cookie);
    await api.projects.post({ key: 'MKT', name: 'Marketing' });
    const columns = (await api.projects({ projectKey: 'MKT' }).get()).data!.columns;
    const col = (type: string) => columns.find((c) => c.stateType === type)!.id;
    const issues = api.projects({ projectKey: 'MKT' }).issues;
    const make = (title: string, columnId: number, patch: Record<string, unknown> = {}) =>
      issues.post({ columnId, title, assigneeUserId: u.userId, ...patch });

    await make('late', col('unstarted'), { dueDate: '2026-09-20' });
    await make('due', col('unstarted'), { dueDate: DATE });
    await make('doing', col('started'));
    await make('starts', col('unstarted'), { startDate: '2026-09-27' });
    await make('future', col('unstarted'), { dueDate: '2026-10-10' });
    await make('done', col('completed'), { dueDate: '2026-09-20' });
    await issues.post({ columnId: col('unstarted'), title: 'unassigned', dueDate: DATE });

    const res = await api.today.get({ query: { date: DATE } });
    expect(res.status).toBe(200);
    const byTitle = Object.fromEntries(res.data!.items.map((i) => [i.title, i.bucket]));
    expect(byTitle).toEqual({ late: 'overdue', due: 'due', doing: 'started', starts: 'scheduled' });
    expect(res.data!.items[0].projectRef).toEndWith('.MKT');
  });

  it("hides another user's issues", async () => {
    const a = await signUpTestUser();
    const b = await signUpTestUser();
    const apiA = authedApi(a.cookie);
    await apiA.projects.post({ key: 'MKT', name: 'Marketing' });
    const columns = (await apiA.projects({ projectKey: 'MKT' }).get()).data!.columns;
    await apiA
      .projects({ projectKey: 'MKT' })
      .issues.post({
        columnId: columns[0].id,
        title: 'mine',
        assigneeUserId: a.userId,
        dueDate: DATE,
      });

    const res = await authedApi(b.cookie).today.get({ query: { date: DATE } });
    expect(res.data!.items).toHaveLength(0);
  });

  it('rejects a malformed date', async () => {
    const u = await signUpTestUser();
    const res = await authedApi(u.cookie).today.get({ query: { date: 'today' } });
    expect(res.status).toBe(400);
  });

  it('prefers overdue over in progress', () => {
    expect(
      bucketOf(
        { dueDate: '2026-09-01', startDate: null, stateType: 'started', inCurrentCycle: true },
        DATE,
      ),
    ).toBe('overdue');
  });
});
