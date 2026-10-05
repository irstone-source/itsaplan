import { describe, it, expect, beforeEach } from 'bun:test';
import { db, project } from '@repo/db';
import { eq } from 'drizzle-orm';
import { resetDb } from '#tests/helpers/db';
import { addUser, joinProject, setup } from '../../../god/__tests__/helpers';
import { periodStartOf, previousPeriodStart } from '../../engine';

// The growth tracker: measures on a project or initiative, judged each period
// against a versioned target, with figures from people or from It's a Plan itself.

const today = new Date().toISOString().slice(0, 10);
const thisWeek = periodStartOf(today, 'week');
const lastWeek = previousPeriodStart(thisWeek, 'week');
const twoWeeksAgo = previousPeriodStart(lastWeek, 'week');
// Treaty revives date strings into Date objects.
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

async function consulting(god: Awaited<ReturnType<typeof setup>>['god']) {
  await god.api.god.billing.put({ hoursPerDay: 6, internalDayRatePence: null });
  await god.api.projects.post({ key: 'CON', name: 'Consulting' });
  const con = god.api.projects({ projectKey: 'CON' });
  await con.settings.estimates.patch({ points: false, time: true, logging: false });
  const [{ id: projectId }] = await db.select().from(project).where(eq(project.key, 'CON'));
  const client = (
    await con.initiatives.post({
      title: 'GSG — goal',
      billingModel: 'retainer',
      dayRatePence: 60000,
    })
  ).data!;
  return { con, projectId, client };
}

const base = (projectId: number) => ({
  projectId,
  initiativeId: null,
  company: 'Cambray',
  loop: 'Rev loop',
  name: 'Sales calls',
  definition: 'Outbound calls that reached a person.',
  kind: 'activity' as const,
  unit: 'count' as const,
  direction: 'at_least' as const,
  cadence: 'week' as const,
  unlockPeriods: 0,
  source: 'manual' as const,
  ownerUserId: null,
  startsOn: twoWeeksAgo,
  rule: { type: 'fixed' as const, value: 20 },
});

describe('tracker', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('colours entered weeks, shows a missing week as black, and restates a closed week', async () => {
    const { god } = await setup();
    const { projectId } = await consulting(god);
    const created = await god.api.tracker.measures.post(base(projectId));
    expect(created.status).toBe(201);
    const id = created.data!.id;
    const entry = (actual: number) => ({
      actual,
      done: null,
      note: '',
      verified: true,
      evidence: '',
    });

    expect(
      (
        await god.api.tracker
          .measures({ measureId: id })
          .entries({ periodStart: twoWeeksAgo })
          .put(entry(19))
      ).status,
    ).toBe(204);

    let m = (await god.api.tracker.get({ query: {} })).data!.measures[0]!;
    const cell = (p: string) => m.cells.find((c) => day(c.periodStart) === p)!;
    expect(cell(twoWeeksAgo)).toMatchObject({ colour: 'green', target: 20, actual: 19 });
    expect(cell(lastWeek).colour).toBe('black');
    expect(['open', 'black']).toContain(cell(thisWeek).colour);

    await god.api.tracker
      .measures({ measureId: id })
      .entries({ periodStart: twoWeeksAgo })
      .put(entry(10));
    m = (await god.api.tracker.get({ query: {} })).data!.measures[0]!;
    expect(cell(twoWeeksAgo)).toMatchObject({ colour: 'red', restated: true });

    const future = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    expect(
      (
        await god.api.tracker
          .measures({ measureId: id })
          .entries({ periodStart: periodStartOf(future, 'week') })
          .put(entry(1))
      ).status,
    ).toBe(400);
  });

  it('fills billings from completed work and takes the target from the finance cycle', async () => {
    const { god } = await setup();
    const { con, projectId, client } = await consulting(god);
    const cols = (await con.get()).data!.columns;
    const done = cols.find((c) => c.stateType === 'completed')!.id;
    await con.issues.post({
      columnId: done,
      title: 'a',
      estimateMinutes: 360,
      initiativeId: client.id,
    });

    const res = await god.api.tracker.measures.post({
      ...base(projectId),
      initiativeId: client.id,
      name: 'GSG billings',
      kind: 'outcome',
      unit: 'money',
      source: 'billings',
      startsOn: thisWeek,
      rule: { type: 'fixed', value: 60000 },
    });
    expect(res.status).toBe(201);
    const m = (await god.api.tracker.get({ query: { initiativeId: client.id } })).data!
      .measures[0]!;
    expect(m.cells.at(-1)).toMatchObject({
      actual: 60000,
      colour: 'green',
      evidence: 'It’s a Plan',
    });

    // A system measure takes no typed figures.
    const typed = await god.api.tracker
      .measures({ measureId: res.data!.id })
      .entries({ periodStart: thisWeek })
      .put({ actual: 1, done: null, note: '', verified: true, evidence: '' });
    expect(typed.status).toBe(400);

    // The finance rule reads the cycle's target, spread by working days.
    const monday = new Date(`${thisWeek}T00:00:00Z`);
    const friday = new Date(monday.getTime() + 4 * 86_400_000).toISOString().slice(0, 10);
    const cycle = (
      await con.cycles.post({ name: 'This week', startDate: thisWeek, endDate: friday })
    ).data!;
    await god.api.cycles({ cycleId: cycle.id }).patch({ targetPence: 500000 });
    const fin = await god.api.tracker.measures.post({
      ...base(projectId),
      name: 'Consulting billings',
      kind: 'outcome',
      unit: 'money',
      source: 'billings',
      startsOn: thisWeek,
      rule: { type: 'finance' },
    });
    expect(fin.status).toBe(201);
    const board = (await god.api.tracker.get({ query: { projectId } })).data!;
    const finMeasure = board.measures.find((x) => x.id === fin.data!.id)!;
    expect(finMeasure.cells.at(-1)).toMatchObject({ target: 500000, actual: 60000 });
  });

  it('keeps old targets for past weeks and needs a reason to change one', async () => {
    const { god } = await setup();
    const { projectId } = await consulting(god);
    const id = (await god.api.tracker.measures.post(base(projectId))).data!.id;
    await god.api.tracker
      .measures({ measureId: id })
      .entries({ periodStart: twoWeeksAgo })
      .put({ actual: 19, done: null, note: '', verified: true, evidence: '' });

    const noReason = await god.api.tracker
      .measures({ measureId: id })
      .patch({ rule: { type: 'fixed', value: 40 } });
    expect(noReason.status).toBe(400);
    await god.api.tracker
      .measures({ measureId: id })
      .patch({ rule: { type: 'fixed', value: 40 }, reason: 'Second caller joined' });

    const m = (await god.api.tracker.get({ query: {} })).data!.measures[0]!;
    expect(m.cells.find((c) => day(c.periodStart) === twoWeeksAgo)).toMatchObject({
      target: 20,
      colour: 'green',
    });
    expect(m.cells.at(-1)!.target).toBe(40);
    expect(m.targetHistory.map((h) => h.reason)).toEqual([
      'Initial target',
      'Second caller joined',
    ]);
  });

  it('lets only the target setter change measures and only owners enter figures', async () => {
    const { god } = await setup();
    const { projectId } = await consulting(god);
    const member = await addUser();
    const outsider = await addUser();
    await joinProject(god, member, 'CON', 'member');

    expect(
      (await member.api.tracker.measures.post({ ...base(projectId), ownerUserId: member.id }))
        .status,
    ).toBe(403);
    const id = (await god.api.tracker.measures.post({ ...base(projectId), ownerUserId: member.id }))
      .data!.id;
    const figure = { actual: 5, done: null, note: '', verified: false, evidence: 'standup' };
    expect(
      (
        await member.api.tracker
          .measures({ measureId: id })
          .entries({ periodStart: lastWeek })
          .put(figure)
      ).status,
    ).toBe(204);
    expect((await outsider.api.tracker.get({ query: {} })).data!.measures).toHaveLength(0);
    expect(
      (
        await outsider.api.tracker
          .measures({ measureId: id })
          .entries({ periodStart: lastWeek })
          .put(figure)
      ).status,
    ).toBe(404);

    const holes = (await member.api.tracker.holes.get()).data!;
    expect(
      holes.some(
        (h) => h.measureId === id && day(h.periodStart) === lastWeek && h.kind === 'unverified',
      ),
    ).toBe(true);

    // Handing targets to measure owners lets the member change their own measure.
    const settings = (await god.api.god.tracker.get()).data!;
    expect((await member.api.god.tracker.put(settings)).status).toBe(403);
    await god.api.god.tracker.put({ ...settings, targetSetters: 'measure_owner' });
    expect(
      (
        await member.api.tracker
          .measures({ measureId: id })
          .patch({ rule: { type: 'fixed', value: 30 }, reason: 'r' })
      ).status,
    ).toBe(200);
  });

  it('validates the settings and caps measures per initiative', async () => {
    const { god } = await setup();
    const { projectId, client } = await consulting(god);
    const settings = (await god.api.god.tracker.get()).data!;
    expect(settings).toMatchObject({
      greenPercent: 90,
      amberPercent: 70,
      loops: ['Rev loop', 'Cap loop'],
    });
    expect((await god.api.god.tracker.put({ ...settings, amberPercent: 95 })).status).toBe(400);
    await god.api.god.tracker.put({ ...settings, maxMeasuresPerInitiative: 1 });

    const onClient = { ...base(projectId), initiativeId: client.id };
    expect((await god.api.tracker.measures.post(onClient)).status).toBe(201);
    expect((await god.api.tracker.measures.post(onClient)).status).toBe(409);
    expect((await god.api.tracker.measures.post({ ...base(projectId), loop: 'Nope' })).status).toBe(
      400,
    );
  });

  it('imports measures by project key, initiative and owner email, once', async () => {
    const { god } = await setup();
    const { client } = await consulting(god);
    const member = await addUser();
    const item = {
      projectKey: 'CON',
      initiative: 'GSG',
      ownerEmail: member.email.toUpperCase(),
      company: 'George Stone Gardens',
      loop: 'Rev loop',
      name: 'Design visits booked',
      definition: 'Visits booked in the CRM.',
      kind: 'outcome' as const,
      unit: 'count' as const,
      direction: 'at_least' as const,
      cadence: 'week' as const,
      unlockPeriods: 0,
      source: 'manual' as const,
      startsOn: thisWeek,
      rule: { type: 'unset' as const },
    };
    const first = await god.api.tracker.measures.import.post({
      measures: [
        item,
        { ...item, name: 'Elsewhere', projectKey: 'NOPE' },
        { ...item, name: 'Other', initiative: 'Zzz' },
      ],
    });
    expect(first.status).toBe(200);
    expect(first.data!.created.map((c) => c.name)).toEqual(['Design visits booked']);
    expect(first.data!.skipped.map((s) => s.name)).toEqual(['Elsewhere', 'Other']);
    const again = await god.api.tracker.measures.import.post({ measures: [item] });
    expect(again.data!.skipped[0]!.reason).toBe('Already tracked');

    const board = (await god.api.tracker.get({ query: {} })).data!;
    const m = board.measures.find((x) => x.name === 'Design visits booked')!;
    expect(m).toMatchObject({ initiativeId: client.id, ownerUserId: member.id });
    expect(m.cells.at(-1)!.target).toBeNull();
    expect(board.settings.companies).toContain('George Stone Gardens');
    expect(board.pulse.length).toBeGreaterThan(0);

    expect((await member.api.tracker.measures.import.post({ measures: [item] })).status).toBe(403);
  });

  it('loads the starter set, skipping initiatives this instance lacks', async () => {
    const { god } = await setup();
    await consulting(god);
    const res = await god.api.god.tracker.starter.post();
    expect(res.status).toBe(200);
    expect(res.data!.created.length).toBeGreaterThan(10);
    expect(res.data!.created.map((c) => c.name)).toContain('Billings: GSG');
    expect(res.data!.skipped.map((s) => s.name)).toContain('Billings: FGE');
    expect((await god.api.god.tracker.starter.post()).data!.created).toHaveLength(0);
  });
});
