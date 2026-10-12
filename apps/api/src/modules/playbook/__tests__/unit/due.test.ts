import { describe, it, expect } from 'bun:test';
import { isDue } from '../../service';

describe('isDue', () => {
  it('makes monthly items due every month and ad-hoc items never', () => {
    for (let m = 1; m <= 12; m++) {
      expect(isDue({ cadence: 'monthly', quarterMonth: 1 }, m)).toBe(true);
      expect(isDue({ cadence: 'ad_hoc', quarterMonth: 1 }, m)).toBe(false);
    }
  });

  it('makes a quarterly item due in its month of each quarter', () => {
    const months = (q: number) =>
      [...Array(12).keys()]
        .map((i) => i + 1)
        .filter((m) => isDue({ cadence: 'quarterly', quarterMonth: q }, m));
    expect(months(1)).toEqual([1, 4, 7, 10]);
    expect(months(2)).toEqual([2, 5, 8, 11]);
    expect(months(3)).toEqual([3, 6, 9, 12]);
  });
});
