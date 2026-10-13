import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, joinProject, setup } from '../../../god/__tests__/helpers';

// Loading a playbook from spreadsheet rows, with the MGM and quarterly-review setup.

const ROWS = [
  { client: 'GSG', deliverable: 'Town page', price: '250', billing: 'retainer', cadence: 'ad_hoc' },
  {
    client: 'gsg',
    deliverable: 'Ad management',
    price: '£1,500',
    estimateHours: '10',
    measure: 'Cost per deal toward £750',
  },
  { client: 'Cotswold Wellness', deliverable: 'Six blog posts', price: '1200' },
  { client: 'Nobody', deliverable: 'Lost' },
];

describe('Playbook import', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('plans without writing, applies once, and skips what exists on a rerun', async () => {
    const { god } = await setup();
    const jo = await addUser({ name: 'Jo' });
    await god.api.projects.post({ key: 'CON', name: 'Consulting' });
    await joinProject(god, jo, 'CON', 'member');
    const con = god.api.projects({ projectKey: 'CON' });
    await con.initiatives.post({ title: 'GSG — leads' });
    await con.initiatives.post({ title: 'FGE — installs' });
    await con.initiatives.post({ title: 'Cotswold Wellness — launch' });
    const asJo = jo.api.projects({ projectKey: 'CON' });

    const plan = await asJo.playbook.import.post({ rows: ROWS, setup: true, apply: false });
    expect(plan.status).toBe(200);
    const kinds = (k: string) => plan.data!.actions.filter((a) => a.kind === k);
    expect(kinds('class').map((a) => a.text)).toEqual([
      'GSG — leads → committed',
      'FGE — installs → committed',
      'Cotswold Wellness — launch → new',
    ]);
    expect(kinds('label').map((a) => a.text)).toEqual(['MGM', 'scope change']);
    expect(kinds('initiative').map((a) => a.text)).toEqual(['MGM — Consulting management']);
    // 7 MGM items, a quarterly and a monthly review per committed client, 3 rows.
    expect(kinds('item')).toHaveLength(14);
    expect(kinds('skip').map((a) => a.text)).toEqual([
      'Nobody: no initiative match "Nobody — …" (Lost)',
    ]);
    expect((await con.playbook.get()).data).toEqual([]);

    const applied = await asJo.playbook.import.post({ rows: ROWS, setup: true, apply: true });
    expect(applied.data!.actions.filter((a) => a.kind === 'item')).toHaveLength(14);
    const groups = (await con.playbook.get()).data!;
    expect(groups.map((g) => [g.title, g.revenueClass, g.items.length])).toEqual([
      ['FGE — installs', 'committed', 2],
      ['GSG — leads', 'committed', 4],
      ['Cotswold Wellness — launch', 'new', 1],
      ['MGM — Consulting management', 'management', 7],
    ]);
    const gsg = groups.find((g) => g.title === 'GSG — leads')!;
    expect(gsg.items.find((i) => i.title === 'Ad management')).toMatchObject({
      pricePence: 150000,
      billing: 'billable',
      cadence: 'monthly',
      estimateMinutes: 600,
      measure: 'Cost per deal toward £750',
    });
    expect(gsg.items.find((i) => i.title === 'Quarterly strategic review')).toMatchObject({
      cadence: 'quarterly',
      quarterMonth: 1,
    });
    const fge = groups.find((g) => g.title === 'FGE — installs')!;
    expect(fge.items.find((i) => i.cadence === 'quarterly')).toMatchObject({
      title: 'Quarterly strategic review',
      quarterMonth: 2,
    });
    const mgm = groups.find((g) => g.revenueClass === 'management')!;
    expect(mgm.items[0]!.labelIds).toHaveLength(1);

    const rerun = await asJo.playbook.import.post({ rows: ROWS, setup: true, apply: true });
    expect(rerun.data!.actions.filter((a) => a.kind !== 'skip')).toEqual([]);
  });

  it('refuses a non-member', async () => {
    const { god } = await setup();
    const outsider = await addUser({ name: 'Out' });
    await god.api.projects.post({ key: 'CON', name: 'Consulting' });
    const res = await outsider.api
      .projects({ projectKey: 'CON' })
      .playbook.import.post({ rows: [], setup: false, apply: false });
    expect(res.status).toBe(403);
  });
});
