import { describe, it, expect } from 'bun:test';
import { londonDate, londonDayRange, londonMidnight, londonWeekStart } from '../../london';

describe('London days', () => {
  it('gives the London day of an instant', () => {
    expect(londonDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(londonDate(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01');
  });

  it('starts a day at London midnight, in summer and winter', () => {
    expect(londonMidnight('2026-07-15').toISOString()).toBe('2026-07-14T23:00:00.000Z');
    expect(londonMidnight('2026-01-15').toISOString()).toBe('2026-01-15T00:00:00.000Z');
    // The clocks go back on 25 October 2026.
    expect(londonMidnight('2026-10-25').toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(londonMidnight('2026-10-26').toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('spans a day as [start, end)', () => {
    const [start, end] = londonDayRange('2026-10-25');
    expect(start.toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(() => londonDayRange('2026-02-30')).toThrow();
  });

  it('starts the week on Monday 00:00 London', () => {
    expect(londonWeekStart(new Date('2026-11-04T12:00:00Z')).toISOString()).toBe(
      '2026-11-02T00:00:00.000Z',
    );
    expect(londonWeekStart(new Date('2026-11-01T23:30:00Z')).toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
    expect(londonWeekStart(new Date('2026-07-05T23:30:00Z')).toISOString()).toBe(
      '2026-07-05T23:00:00.000Z',
    );
  });
});
