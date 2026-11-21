import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { workingDaysBetween } from './workingDays';

describe('workingDaysBetween', () => {
  it('counts the weekdays between two days, leaving out both ends', () => {
    // Thursday 19 Nov 2026 to Monday 23 Nov: only Friday is between.
    assert.equal(workingDaysBetween(new Date(2026, 10, 19, 17), new Date(2026, 10, 23, 9)), 1);
    assert.equal(workingDaysBetween(new Date(2026, 10, 19, 17), new Date(2026, 10, 24, 9)), 2);
    assert.equal(workingDaysBetween(new Date(2026, 10, 23, 9), new Date(2026, 10, 23, 18)), 0);
  });
});
