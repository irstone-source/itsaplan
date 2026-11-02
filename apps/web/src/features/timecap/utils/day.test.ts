import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shiftDay, todayLondon, yesterdayLondon } from './day';

describe('shiftDay', () => {
  it('steps calendar days across month and year ends', () => {
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
    assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  });
});

describe('todayLondon', () => {
  it('reads the London day, not the UTC one', () => {
    assert.equal(todayLondon(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
    assert.equal(todayLondon(new Date('2026-01-01T23:30:00Z')), '2026-01-01');
  });
});

describe('yesterdayLondon', () => {
  it('is the day before, on the night the clocks go forward', () => {
    // 00:30 BST on Monday 30 March 2026, 23 hours after Sunday began.
    assert.equal(yesterdayLondon(new Date('2026-03-29T23:30:00Z')), '2026-03-29');
  });

  it('is the day before, on the night the clocks go back', () => {
    assert.equal(yesterdayLondon(new Date('2026-10-26T00:30:00Z')), '2026-10-25');
  });
});
