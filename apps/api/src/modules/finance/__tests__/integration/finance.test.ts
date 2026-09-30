import { describe, it, expect, beforeEach } from 'bun:test';
import { db, project } from '@repo/db';
import { eq } from 'drizzle-orm';
import { resetDb } from '#tests/helpers/db';
import { addUser, setup } from '../../../god/__tests__/helpers';
import { spread, workingDays } from '../../service';

// A year's revenue target, split over the project's cycles by working days.

describe('finance', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('counts working days and splits a total exactly', () => {
    expect(workingDays('2026-10-06', '2026-10-29')).toBe(18);
    expect(workingDays('2026-12-01', '2026-12-31')).toBe(23);
    expect(spread(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(spread(100, [0, 0])).toEqual([0, 0]);
  });

  it('spreads the year target over the cycles starting in its months', async () => {
    const { god } = await setup();
    await god.api.projects.post({ key: 'CON', name: 'Consulting' });
    const cycles = god.api.projects({ projectKey: 'CON' }).cycles;
    await cycles.post({ name: 'September 2026', startDate: '2026-09-28', endDate: '2026-09-30' });
    const oct = (
      await cycles.post({ name: 'October 2026', startDate: '2026-10-06', endDate: '2026-10-29' })
    ).data!;
    const nov = (
      await cycles.post({ name: 'November 2026', startDate: '2026-11-03', endDate: '2026-11-26' })
    ).data!;
    const [{ id: projectId }] = await db.select().from(project).where(eq(project.key, 'CON'));

    const res = await god.api.god
      .finance({ start: '2026-10' })
      .put({ revenueTargetPence: 3_600_000, projectId });
    expect(res.status).toBe(200);
    expect(res.data!.months).toHaveLength(12);
    const [first, second, third] = res.data!.months;
    // 18 working days each.
    expect(first.cycle).toMatchObject({ id: oct.id, workingDays: 18, targetPence: 1_800_000 });
    expect(second.cycle).toMatchObject({ id: nov.id, workingDays: 18, targetPence: 1_800_000 });
    expect(third.cycle).toBeNull();

    const again = await god.api.god.finance.get({ query: {} });
    expect(again.data).toMatchObject({ startMonth: '2026-10', revenueTargetPence: 3_600_000 });
  });

  it('is owner-only', async () => {
    await setup();
    const member = await addUser();
    expect((await member.api.god.finance.get({ query: {} })).status).toBe(403);
    expect(
      (
        await member.api.god
          .finance({ start: '2026-10' })
          .put({ revenueTargetPence: 1, projectId: 1 })
      ).status,
    ).toBe(403);
  });
});
