import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, setup } from '../../../god/__tests__/helpers';
import { valueOf } from '../../billables';

// A cycle's billables: each estimate in days (hoursPerDay) times its initiative's day
// rate, or the internal day rate on an internal project. Canceled issues are left
// out; issues without an estimate or a rate are counted, not valued.

async function project(api: Awaited<ReturnType<typeof setup>>['god']['api'], key: string) {
  await api.projects.post({ key, name: key });
  await api.projects({ projectKey: key }).settings.estimates.patch({
    points: false,
    time: true,
    logging: false,
  });
  const scaffold = (await api.projects({ projectKey: key }).get()).data!;
  const col = (type: string) => scaffold.columns.find((c) => c.stateType === type)!.id;
  const cycle = (
    await api.projects({ projectKey: key }).cycles.post({
      name: 'October 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    })
  ).data!;
  return { col, cycleId: cycle.id };
}

describe('cycle billables', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('values estimates at the initiative rate, splits done from planned, flags gaps', async () => {
    const { god } = await setup();
    await god.api.god.billing.put({ hoursPerDay: 8, internalDayRatePence: 30000 });
    const { col, cycleId } = await project(god.api, 'CON');
    const issues = god.api.projects({ projectKey: 'CON' }).issues;
    const initiatives = god.api.projects({ projectKey: 'CON' }).initiatives;
    const gsg = (
      await initiatives.post({ title: 'GSG — goal', billingModel: 'day_rate', dayRatePence: 60000 })
    ).data!;
    const unrated = (await initiatives.post({ title: 'WSD — goal' })).data!;
    const make = (title: string, column: string, patch: Record<string, unknown>) =>
      issues.post({ columnId: col(column), title, cycleId, ...patch });

    await make('day done', 'completed', { estimateMinutes: 480, initiativeId: gsg.id });
    await make('half day', 'unstarted', { estimateMinutes: 240, initiativeId: gsg.id });
    await make('no estimate', 'unstarted', { initiativeId: gsg.id });
    await make('no rate', 'unstarted', { estimateMinutes: 60, initiativeId: unrated.id });
    await make('canceled', 'canceled', { estimateMinutes: 480, initiativeId: gsg.id });

    const res = await god.api.cycles({ cycleId }).billables.get();
    expect(res.status).toBe(200);
    expect(res.data!.totals).toEqual({
      billablePence: 90000,
      billableDonePence: 60000,
      internalPence: 0,
      internalDonePence: 0,
      netPence: 90000,
      estimatedMinutes: 780,
      unestimated: 1,
      unpriced: 1,
    });
    const group = res.data!.groups.find((g) => g.initiativeId === gsg.id)!;
    expect(group).toMatchObject({ valuePence: 90000, donePence: 60000, issueCount: 3 });
    expect(res.data!.issues.map((i) => i.title)).not.toContain('canceled');
  });

  it('costs an internal project at the internal day rate', async () => {
    const { god } = await setup();
    await god.api.god.billing.put({ hoursPerDay: 7.5, internalDayRatePence: 30000 });
    const { col, cycleId } = await project(god.api, 'IPD');
    await god.api.projects({ projectKey: 'IPD' }).patch({ internal: true });
    await god.api
      .projects({ projectKey: 'IPD' })
      .issues.post({ columnId: col('started'), title: 'build', cycleId, estimateMinutes: 450 });

    const res = await god.api.cycles({ cycleId }).billables.get();
    expect(res.data!.totals.internalPence).toBe(30000);
    expect(res.data!.totals.billablePence).toBe(0);
    expect(res.data!.groups[0]).toMatchObject({ kind: 'internal', title: 'Internal work' });
  });

  it('uses a value set by hand, costs internal work off the net, and reports the target', async () => {
    const { god } = await setup();
    await god.api.god.billing.put({ hoursPerDay: 6, internalDayRatePence: 30000 });
    const { col, cycleId } = await project(god.api, 'CON');
    await god.api.cycles({ cycleId }).patch({ targetPence: 500000 });
    const initiatives = god.api.projects({ projectKey: 'CON' }).initiatives;
    const client = (
      await initiatives.post({
        title: 'LANO — goal',
        billingModel: 'retainer',
        dayRatePence: 100000,
      })
    ).data!;
    const internal = (await initiatives.post({ title: 'Cambray — ops', billingModel: 'internal' }))
      .data!;
    const issues = god.api.projects({ projectKey: 'CON' }).issues;
    const make = (title: string, patch: Record<string, unknown>) =>
      issues.post({ columnId: col('unstarted'), title, cycleId, ...patch });

    await make('by rate', { estimateMinutes: 360, initiativeId: client.id });
    const fixed = (
      await make('fixed price', { valueOverridePence: 250000, initiativeId: client.id })
    ).data!;
    await make('ops', { estimateMinutes: 180, initiativeId: internal.id });

    const res = await god.api.cycles({ cycleId }).billables.get();
    expect(res.data!.targetPence).toBe(500000);
    expect(res.data!.totals).toMatchObject({
      billablePence: 350000,
      internalPence: 15000,
      netPence: 335000,
      unestimated: 0,
      unpriced: 0,
    });
    expect(res.data!.issues.find((i) => i.id === fixed.id)).toMatchObject({
      valuePence: 250000,
      overridden: true,
    });
    expect(fixed.valueOverridePence).toBe(250000);
    expect(fixed.initiative).toMatchObject({ billingModel: 'retainer', dayRatePence: 100000 });
  });

  it('keeps billing settings owner-only and readable by members', async () => {
    const { god } = await setup();
    const member = await addUser();
    expect(
      (await member.api.god.billing.put({ hoursPerDay: 8, internalDayRatePence: 1 })).status,
    ).toBe(403);
    expect((await member.api.settings.billing.get()).data).toEqual({
      hoursPerDay: 8,
      internalDayRatePence: null,
    });
    expect(
      (await god.api.god.billing.put({ hoursPerDay: 0, internalDayRatePence: null })).status,
    ).toBe(400);
  });

  it('rounds a value to whole pence', () => {
    expect(valueOf(100, 8, 60000)).toBe(12500);
    expect(valueOf(1, 7.5, 33333)).toBe(74);
  });
});
