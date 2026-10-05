import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_TRACKER_SETTINGS as S,
  colourPeriods,
  financeTarget,
  isClosed,
  periodStartOf,
  recentPeriods,
  ruleTarget,
  type PeriodInput,
  type TargetRule,
} from '../../engine';

const p = (over: Partial<PeriodInput>): PeriodInput => ({
  periodStart: '2026-10-05',
  closed: true,
  locked: false,
  target: 10,
  actual: null,
  done: null,
  hasEntry: true,
  ...over,
});
const outcome = { kind: 'outcome', unit: 'count', direction: 'at_least' } as const;

describe('tracker periods', () => {
  it('starts weeks on Monday and months on the 1st', () => {
    expect(periodStartOf('2026-10-04', 'week')).toBe('2026-09-28');
    expect(periodStartOf('2026-10-05', 'week')).toBe('2026-10-05');
    expect(periodStartOf('2026-10-19', 'month')).toBe('2026-10-01');
    expect(recentPeriods('2026-10-07', 'week', 3)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('closes a period the set hours after it ends', () => {
    expect(isClosed('2026-09-28', 'week', new Date('2026-10-05T11:59:00Z'), 12)).toBe(false);
    expect(isClosed('2026-09-28', 'week', new Date('2026-10-05T12:00:00Z'), 12)).toBe(true);
  });
});

describe('tracker targets', () => {
  it('follows each rule', () => {
    expect(ruleTarget({ type: 'fixed', value: 1 }, 7, '2026-10-05', 'week', null)).toBe(1);
    expect(ruleTarget({ type: 'linear', start: 100, step: 20 }, 3, '', 'week', null)).toBe(160);
    expect(
      ruleTarget({ type: 'compounding', start: 1000, ratePercent: 5 }, 2, '', 'month', null),
    ).toBeCloseTo(1102.5);
    const gate = { type: 'gate', start: 0, target: 100, by: '2026-10-26' } as const;
    expect(ruleTarget(gate, 0, '2026-10-05', 'week', null)).toBe(0);
    expect(ruleTarget(gate, 1, '2026-10-12', 'week', null)).toBeCloseTo(100 / 3);
    expect(ruleTarget(gate, 3, '2026-10-26', 'week', null)).toBe(100);
    const leap: TargetRule = {
      type: 'leapfrog',
      start: 10,
      steps: [
        { from: '2027-01-01', value: 20 },
        { from: '2026-11-01', value: 15 },
      ],
    };
    expect(ruleTarget(leap, 0, '2026-10-01', 'month', null)).toBe(10);
    expect(ruleTarget(leap, 1, '2026-11-01', 'month', null)).toBe(15);
    expect(ruleTarget(leap, 3, '2027-01-01', 'month', null)).toBe(20);
    expect(ruleTarget({ type: 'finance' }, 0, '', 'week', 4200)).toBe(4200);
  });

  it('spreads a cycle value over the periods by working days', () => {
    // 18 working days in the cycle; the week of 5 Oct holds 4 of them (Tue–Fri).
    const cycles = [{ startDate: '2026-10-06', endDate: '2026-10-29', value: 1800 }];
    expect(financeTarget('2026-10-05', '2026-10-12', cycles)).toBe(400);
    expect(financeTarget('2026-10-01', '2026-11-01', cycles)).toBe(1800);
    expect(financeTarget('2026-11-02', '2026-11-09', cycles)).toBeNull();
  });
});

describe('tracker colours', () => {
  it('bands by the share of target', () => {
    const r = colourPeriods([p({ actual: 9 }), p({ actual: 7 }), p({ actual: 6 })], outcome, S);
    expect(r.map((x) => x.colour)).toEqual(['green', 'amber', 'red']);
  });

  it('shows an empty closed period as black and counts it in the streak', () => {
    const r = colourPeriods(
      [
        p({ actual: 1 }),
        p({ hasEntry: false }),
        p({ hasEntry: false }),
        p({ hasEntry: false }),
        p({ hasEntry: false, closed: false }),
      ],
      outcome,
      S,
    );
    expect(r.map((x) => x.colour)).toEqual(['red', 'black', 'black', 'black', 'open']);
    expect(r[3]).toMatchObject({ streak: 4, focus: true });
    expect(r[2]!.focus).toBe(false);
  });

  it('turns a yes/no measure amber on the first miss and red on the second', () => {
    const done = { kind: 'activity', unit: 'done', direction: 'at_least' } as const;
    const r = colourPeriods(
      [p({ done: true }), p({ done: false }), p({ done: false }), p({ done: true })],
      done,
      S,
    );
    expect(r.map((x) => x.colour)).toEqual(['green', 'amber', 'red', 'green']);
    expect(r[2]!.focus).toBe(false);
    expect(r[3]!.streak).toBe(0);
  });

  it('judges a small target on its rolling total', () => {
    const pallets = [0, 2, 1, 0].map((actual) => p({ target: 1, actual }));
    const r = colourPeriods(pallets, outcome, S);
    // Rolling: 0/1, 2/2, 3/3, 3/4.
    expect(r.map((x) => x.colour)).toEqual(['red', 'green', 'green', 'amber']);
    expect(r[3]!.rolling).toEqual({ actual: 3, target: 4 });
  });

  it('waits for the period to close before judging a running figure', () => {
    const r = colourPeriods(
      [
        p({ actual: 2, closed: false, partial: true }),
        p({ actual: 9, closed: false, partial: true }),
      ],
      outcome,
      S,
    );
    expect(r.map((x) => x.colour)).toEqual(['open', 'green']);
  });

  it('trips a guardrail at once and greys a locked period', () => {
    const guard = { kind: 'guardrail', unit: 'money', direction: 'at_most' } as const;
    const r = colourPeriods(
      [p({ locked: true, actual: 99 }), p({ actual: 10 }), p({ actual: 11 })],
      guard,
      S,
    );
    expect(r.map((x) => x.colour)).toEqual(['grey', 'green', 'red']);
    expect(r[2]!.focus).toBe(true);
  });
});

describe('unset targets', () => {
  it('leaves the target empty and the period grey', () => {
    expect(ruleTarget({ type: 'unset' }, 3, '2026-10-05', 'week', null)).toBeNull();
    const r = colourPeriods([p({ target: null, actual: 4 })], outcome, S);
    expect(r[0]!.colour).toBe('grey');
  });
});
