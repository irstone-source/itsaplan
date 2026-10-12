import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, joinProject, setup, type Actor } from '../../../god/__tests__/helpers';

// The playbook: repeatable deliverables per client initiative, priced by outcome,
// and added to a cycle when their cadence makes them due.

async function scaffold(owner: Actor) {
  await owner.api.projects.post({ key: 'CON', name: 'Consulting' });
  await owner.api.projects({ projectKey: 'CON' }).settings.estimates.patch({
    points: false,
    time: true,
    logging: false,
  });
  const con = owner.api.projects({ projectKey: 'CON' });
  const cycle = (name: string, startDate: string, endDate: string) =>
    con.cycles.post({ name, startDate, endDate }).then((r) => r.data!.id);
  const october = await cycle('October 2026', '2026-10-06', '2026-10-29');
  const november = await cycle('November 2026', '2026-11-03', '2026-11-26');
  const gsg = (
    await con.initiatives.post({
      title: 'GSG — leads',
      billingModel: 'retainer',
      revenueClass: 'committed',
      monthlyFeePence: 300000,
    })
  ).data!;
  const cotswold = (
    await con.initiatives.post({ title: 'Cotswold Wellness — launch', revenueClass: 'new' })
  ).data!;
  const mgm = (
    await con.initiatives.post({
      title: 'MGM — Consulting management',
      billingModel: 'internal',
      revenueClass: 'management',
    })
  ).data!;
  return { con, october, november, gsg, cotswold, mgm };
}

describe('Playbook', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lists items per initiative, committed first, priced against the monthly fee', async () => {
    const { god } = await setup();
    const { con, gsg, cotswold } = await scaffold(god);
    await con.playbook.post({
      initiativeId: cotswold.id,
      title: 'Landing page',
      pricePence: 25000,
    });
    await con.playbook.post({
      initiativeId: gsg.id,
      title: 'Ad management',
      pricePence: 150000,
      billing: 'retainer',
    });
    await con.playbook.post({
      initiativeId: gsg.id,
      title: 'Strategic review',
      pricePence: 60000,
      cadence: 'quarterly',
      quarterMonth: 2,
    });
    await con.playbook.post({
      initiativeId: gsg.id,
      title: 'Admin',
      pricePence: 9999,
      billing: 'non_billable',
    });

    const res = await con.playbook.get();
    expect(res.status).toBe(200);
    expect(res.data!.map((g) => g.title)).toEqual(['GSG — leads', 'Cotswold Wellness — launch']);
    expect(res.data![0]).toMatchObject({
      revenueClass: 'committed',
      monthlyFeePence: 300000,
      monthlyPricedPence: 150000 + 20000,
    });
    expect(res.data![0]!.items).toHaveLength(3);
  });

  it('lets a project member maintain the playbook and refuses a non-member', async () => {
    const { god } = await setup();
    const { gsg } = await scaffold(god);
    const jo = await addUser({ name: 'Jo' });
    const outsider = await addUser({ name: 'Out' });
    await joinProject(god, jo, 'CON', 'member');

    const created = await jo.api
      .projects({ projectKey: 'CON' })
      .playbook.post({ initiativeId: gsg.id, title: 'Monthly report', pricePence: 20000 });
    expect(created.status).toBe(201);
    const patched = await jo.api
      .projects({ projectKey: 'CON' })
      .playbook({ itemId: created.data!.id })
      .patch({ pricePence: 25000, active: false });
    expect(patched.data).toMatchObject({ pricePence: 25000, active: false });

    const denied = await outsider.api.projects({ projectKey: 'CON' }).playbook.get();
    expect(denied.status).toBe(403);
  });

  it('rejects an initiative from another project and answers 404 for an unknown item', async () => {
    const { god } = await setup();
    const { con } = await scaffold(god);
    await god.api.projects.post({ key: 'OTH', name: 'Other' });
    const other = (await god.api.projects({ projectKey: 'OTH' }).initiatives.post({ title: 'X' }))
      .data!;
    const bad = await con.playbook.post({ initiativeId: other.id, title: 'Nope' });
    expect(bad.status).toBe(400);
    expect((await con.playbook({ itemId: 999999 }).patch({ title: 'x' })).status).toBe(404);
    expect((await con.playbook({ itemId: 999999 }).delete()).status).toBe(404);
  });

  it('offers what a cycle month makes due and adds it once, valued at its price', async () => {
    const { god } = await setup();
    const { con, october, november, gsg, cotswold, mgm } = await scaffold(god);
    const ads = (
      await con.playbook.post({
        initiativeId: gsg.id,
        title: 'Ad management',
        pricePence: 150000,
        estimateMinutes: 240,
      })
    ).data!;
    const review = (
      await con.playbook.post({
        initiativeId: gsg.id,
        title: 'Strategic review',
        pricePence: 60000,
        cadence: 'quarterly',
        quarterMonth: 2,
      })
    ).data!;
    const page = (
      await con.playbook.post({
        initiativeId: cotswold.id,
        title: 'Town page',
        pricePence: 25000,
        cadence: 'ad_hoc',
      })
    ).data!;
    const admin = (
      await con.playbook.post({
        initiativeId: gsg.id,
        title: 'Chasing',
        pricePence: 5000,
        billing: 'non_billable',
      })
    ).data!;
    const planning = (
      await con.playbook.post({
        initiativeId: mgm.id,
        title: 'Cycle planning',
        billing: 'non_billable',
        estimateMinutes: 120,
      })
    ).data!;

    // October is the first month of its quarter: the quarter-month-2 review is not due.
    const oct = await god.api.cycles({ cycleId: october }).playbook.get();
    expect(oct.status).toBe(200);
    expect(oct.data!.due.map((i) => i.id).sort()).toEqual([ads.id, admin.id, planning.id].sort());
    expect(oct.data!.adHoc.map((i) => i.id)).toEqual([page.id]);
    const nov = await god.api.cycles({ cycleId: november }).playbook.get();
    expect(nov.data!.due.map((i) => i.id)).toContain(review.id);

    const added = await god.api
      .cycles({ cycleId: october })
      .playbook.post({ itemIds: [ads.id, admin.id, planning.id, page.id] });
    expect(added.status).toBe(201);
    expect(added.data!.created).toHaveLength(4);
    expect(added.data!.skipped).toEqual([]);

    const again = await god.api.cycles({ cycleId: october }).playbook.post({ itemIds: [ads.id] });
    expect(again.data).toEqual({ created: [], skipped: [ads.id] });
    const after = await god.api.cycles({ cycleId: october }).playbook.get();
    expect(after.data!.due).toEqual([]);
    expect(after.data!.added).toHaveLength(4);

    const issueOf = (itemId: number) =>
      god.api
        .issues({ issueId: added.data!.created.find((c) => c.itemId === itemId)!.issueId })
        .get()
        .then((r) => r.data!);
    expect(await issueOf(ads.id)).toMatchObject({
      title: 'Ad management',
      estimateMinutes: 240,
      valueOverridePence: 150000,
      initiative: { id: gsg.id },
      cycle: { id: october },
    });
    expect((await issueOf(admin.id)).valueOverridePence).toBe(0);
    expect((await issueOf(planning.id)).valueOverridePence).toBeNull();
  });

  it('splits cycle billables by revenue class and keeps a reserve of capacity', async () => {
    const { god } = await setup();
    await god.api.god.billing.put({
      hoursPerDay: 6,
      internalDayRatePence: 30000,
      reservePercent: 20,
    });
    const { con, october, gsg, cotswold, mgm } = await scaffold(god);
    const items = await Promise.all([
      con.playbook.post({
        initiativeId: gsg.id,
        title: 'Ads',
        pricePence: 150000,
        estimateMinutes: 600,
      }),
      con.playbook.post({
        initiativeId: cotswold.id,
        title: 'Page',
        pricePence: 25000,
        estimateMinutes: 120,
      }),
      con.playbook.post({
        initiativeId: mgm.id,
        title: 'Billing run',
        billing: 'non_billable',
        estimateMinutes: 360,
      }),
    ]);
    await god.api
      .cycles({ cycleId: october })
      .playbook.post({ itemIds: items.map((i) => i.data!.id) });

    const res = await god.api.cycles({ cycleId: october }).billables.get();
    expect(res.status).toBe(200);
    const cls = Object.fromEntries(res.data!.byClass.map((c) => [c.revenueClass, c]));
    expect(cls.committed).toMatchObject({
      valuePence: 150000,
      estimatedMinutes: 600,
      issueCount: 1,
    });
    expect(cls.new).toMatchObject({ valuePence: 25000, estimatedMinutes: 120 });
    // One day of internal rate for six hours of management work.
    expect(cls.management).toMatchObject({ valuePence: 30000, estimatedMinutes: 360 });

    // 18 working days × 6 h × 1 member.
    expect(res.data!.capacity).toEqual({
      capacityMinutes: 18 * 6 * 60,
      overridden: false,
      reservePercent: 20,
      reserveMinutes: Math.round(18 * 6 * 60 * 0.2),
      plannedMinutes: 1080,
      freeMinutes: 18 * 6 * 60 - Math.round(18 * 6 * 60 * 0.2) - 1080,
    });

    await god.api.cycles({ cycleId: october }).patch({ capacityMinutes: 6000 });
    const set = await god.api.cycles({ cycleId: october }).billables.get();
    expect(set.data!.capacity).toMatchObject({
      capacityMinutes: 6000,
      overridden: true,
      reserveMinutes: 1200,
    });
  });
});
