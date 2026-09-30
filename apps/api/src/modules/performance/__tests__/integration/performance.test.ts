import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, joinProject, setup } from '../../../god/__tests__/helpers';

// The monthly performance share: completed client work credited to its assignee,
// measured against the month's break-even, with a bonus pool shared by billings.
// A member reads only their own figures; the instance owner reads everything.

const month = new Date().toISOString().slice(0, 7);

describe('performance', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('credits completed client work to its assignee and shares the pool by billings', async () => {
    const { god } = await setup();
    const a = await addUser();
    const b = await addUser();
    await god.api.god.billing.put({ hoursPerDay: 6, internalDayRatePence: 30000 });
    await god.api.projects.post({ key: 'CON', name: 'Consulting' });
    await god.api.projects({ projectKey: 'CON' }).settings.estimates.patch({
      points: false,
      time: true,
      logging: false,
    });
    await joinProject(god, a, 'CON', 'member');
    await joinProject(god, b, 'CON', 'member');
    const cols = (await god.api.projects({ projectKey: 'CON' }).get()).data!.columns;
    const col = (type: string) => cols.find((c) => c.stateType === type)!.id;
    const initiatives = god.api.projects({ projectKey: 'CON' }).initiatives;
    const client = (
      await initiatives.post({ title: 'GSG — goal', billingModel: 'retainer', dayRatePence: 60000 })
    ).data!;
    const ops = (await initiatives.post({ title: 'Cambray — ops', billingModel: 'internal' }))
      .data!;
    const issues = god.api.projects({ projectKey: 'CON' }).issues;
    const make = (state: string, minutes: number, initiativeId: number, assigneeUserId?: string) =>
      issues.post({
        columnId: col(state),
        title: 't',
        estimateMinutes: minutes,
        initiativeId,
        ...(assigneeUserId ? { assigneeUserId } : {}),
      });

    await make('completed', 360, client.id, a.id); // £600
    await make('completed', 720, client.id, b.id); // £1,200
    await make('completed', 180, client.id); // £300, unassigned
    await make('completed', 360, ops.id, a.id); // internal: not billings
    await make('unstarted', 360, client.id, a.id); // not done

    const set = await god.api.god
      .performance({ month })
      .put({ breakEvenPence: 150000, poolPercent: 20 });
    expect(set.status).toBe(200);
    expect(set.data!.team).toEqual({
      billingsPence: 210000,
      aboveBreakEvenPence: 60000,
      poolPence: 12000,
      progress: 1.4,
    });
    const byUser = Object.fromEntries(set.data!.people.map((p) => [p.userId, p]));
    expect(byUser[a.id]).toMatchObject({
      billingsPence: 60000,
      shareOfBreakEven: 0.4,
      bonusPence: 3429,
    });
    expect(byUser[b.id]).toMatchObject({ billingsPence: 120000, bonusPence: 6857 });

    const mine = await a.api.performance.me.get({ query: { month } });
    expect(mine.data).toMatchObject({
      breakEvenSet: true,
      me: { billingsPence: 60000, shareOfBreakEven: 0.4, bonusPence: 3429 },
      teamProgress: 1.4,
    });
    expect(Object.keys(mine.data!)).not.toContain('people');
    expect(mine.data!.me.tickets).toHaveLength(1);
  });

  it('keeps the team view and the month settings owner-only', async () => {
    const { god } = await setup();
    const member = await addUser();
    expect((await member.api.god.performance.get({ query: { month } })).status).toBe(403);
    expect(
      (await member.api.god.performance({ month }).put({ breakEvenPence: 1, poolPercent: 1 }))
        .status,
    ).toBe(403);
    const empty = await member.api.performance.me.get({ query: { month } });
    expect(empty.data).toMatchObject({ breakEvenSet: false, teamProgress: null });
    expect(
      (await god.api.god.performance({ month }).put({ breakEvenPence: 1, poolPercent: 101 }))
        .status,
    ).toBe(400);
  });
});
