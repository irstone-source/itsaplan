import { describe, it, expect } from 'bun:test';
import { issueRefs, timeState } from '../../match';

describe('issueRefs', () => {
  it('reads identifiers from the titles in order, task first', () => {
    expect(issueRefs('CON-14 — Ads', 'follow up on LOOPS-2', null)).toEqual([
      { key: 'CON', sequenceNumber: 14 },
      { key: 'LOOPS', sequenceNumber: 2 },
    ]);
  });

  it('ignores lower case and bare numbers', () => {
    expect(issueRefs('con-14 and 2026-11 and A-1')).toEqual([]);
  });
});

describe('timeState', () => {
  it('flags at 60% of the limit and stops at 70%', () => {
    expect(timeState(59, 100)).toBe('ok');
    expect(timeState(60, 100)).toBe('flag');
    expect(timeState(69, 100)).toBe('flag');
    expect(timeState(70, 100)).toBe('stop');
    expect(timeState(500, null)).toBe('none');
    expect(timeState(0, 0)).toBe('none');
  });
});
