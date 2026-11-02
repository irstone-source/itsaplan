import { describe, it, expect } from 'bun:test';
import {
  NO_SUGGESTION,
  clientName,
  distinctiveWord,
  matchCall,
  matchRule,
  orderRules,
  stretchesDuring,
  suggest,
  ticketRef,
  type BlockFacts,
  type RuleFacts,
} from '../../suggest';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 2, 9, minutes));

function block(over: Partial<BlockFacts> = {}): BlockFacts {
  return {
    source: 'activity',
    app: 'Google Chrome',
    title: 'Campaigns - Google Ads',
    domain: 'ads.google.com',
    detail: {},
    startedAt: at(0),
    endedAt: at(60),
    ...over,
  };
}

function rule(over: Partial<RuleFacts>): RuleFacts {
  return {
    id: 1,
    userId: 'u1',
    field: 'domain',
    pattern: 'google',
    issueId: null,
    initiativeId: 7,
    ignore: false,
    ...over,
  };
}

describe('ticketRef', () => {
  it('reads the first ticket id in a title', () => {
    expect(ticketRef('CON-14 — Ads review (see MKT-2)')).toEqual({
      key: 'CON',
      sequenceNumber: 14,
    });
    expect(ticketRef('Inbox - Gmail')).toBeNull();
  });
});

describe('rules', () => {
  it('puts personal rules before team rules, longer patterns first', () => {
    const team = rule({ id: 1, userId: null, pattern: 'ads.google.com' });
    const short = rule({ id: 2, pattern: 'google' });
    const long = rule({ id: 3, pattern: 'ads.google' });
    expect(orderRules([team, short, long]).map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('matches the field case-insensitively as a substring', () => {
    expect(matchRule(block(), [rule({ pattern: 'ADS.GOOGLE' })])?.id).toBe(1);
    expect(matchRule(block(), [rule({ field: 'app', pattern: 'chrome' })])?.id).toBe(1);
    expect(matchRule(block(), [rule({ field: 'title', pattern: 'campaign' })])?.id).toBe(1);
    expect(matchRule(block(), [rule({ field: 'domain', pattern: 'facebook' })])).toBeNull();
  });

  it('reads a call contact from the detail, else from the title', () => {
    const contact = rule({ field: 'contact', pattern: 'mark' });
    const call = block({ source: 'call', title: 'Call with Mark Smith', domain: null });
    expect(matchRule(call, [contact])?.id).toBe(1);
    expect(matchRule(block({ ...call, detail: { contact: 'Jo' } }), [contact])).toBeNull();
    expect(matchRule(block({ title: 'Mark' }), [contact])).toBeNull();
  });
});

describe('stretchesDuring', () => {
  it('keeps the stretches that overlap the block', () => {
    const during = { issueId: 1, initiativeId: null, enteredAt: at(-30), leftAt: at(10) };
    const open = { issueId: 2, initiativeId: null, enteredAt: at(30), leftAt: null };
    const before = { issueId: 3, initiativeId: null, enteredAt: at(-60), leftAt: at(0) };
    const after = { issueId: 4, initiativeId: null, enteredAt: at(60), leftAt: null };
    expect(stretchesDuring(block(), [during, open, before, after]).map((s) => s.issueId)).toEqual([
      1, 2,
    ]);
  });
});

describe('calls', () => {
  it('names the client from the title prefix', () => {
    expect(clientName('FGE — 32 sales a month')).toBe('fge');
    expect(clientName('GSG - leads')).toBe('gsg');
    expect(clientName('Cambray: site')).toBe('cambray');
    expect(clientName('Internal')).toBe('internal');
  });

  it('matches a contact to a client label or a title prefix', () => {
    const fge = { id: 1, title: 'FGE — 32 sales a month', labels: ['Forever Green Energy'] };
    const gsg = { id: 2, title: 'GSG — leads', labels: [] };
    const call = (contact: string, number = '') =>
      block({ source: 'call', title: `Call with ${contact}`, detail: { contact, number } });
    expect(matchCall(call('Forever Green Energy'), [fge, gsg])?.id).toBe(1);
    expect(matchCall(call('GSG office'), [fge, gsg])?.id).toBe(2);
    expect(matchCall(call('Unknown'), [fge, gsg])).toBeNull();
    expect(matchCall(block(), [fge, gsg])).toBeNull();
  });
});

describe('distinctiveWord', () => {
  it('picks the longest uncommon word', () => {
    expect(distinctiveWord('Campaigns - Google Ads')).toBe('campaigns');
    expect(distinctiveWord('New Tab - Google Chrome')).toBeNull();
    expect(distinctiveWord('Q3 2026')).toBeNull();
  });
});

describe('suggest', () => {
  const stretch = { issueId: 5, initiativeId: 2, enteredAt: at(-30), leftAt: null };
  const ctx = {
    ticket: null,
    rules: [rule({ initiativeId: 7 })],
    stretches: [stretch],
    initiatives: [{ id: 9, title: 'FGE — ads', labels: [] }],
  };

  it('takes the ticket in the title first', () => {
    const ticket = { id: 3, identifier: 'CON-3', initiativeId: 1 };
    expect(suggest(block(), { ...ctx, ticket })).toMatchObject({
      issueId: 3,
      initiativeId: 1,
      confidence: 95,
    });
  });

  it('then a rule', () => {
    expect(suggest(block(), ctx)).toMatchObject({
      initiativeId: 7,
      confidence: 85,
      ruleId: 1,
      ignore: false,
    });
    expect(suggest(block(), { ...ctx, rules: [rule({ ignore: true })] })).toMatchObject({
      ignore: true,
      confidence: 85,
    });
  });

  it('then the ticket in progress, at 60 alone and 40 among several', () => {
    const one = { ...ctx, rules: [] };
    expect(suggest(block(), one)).toMatchObject({ issueId: 5, initiativeId: 2, confidence: 60 });
    const later = { issueId: 6, initiativeId: null, enteredAt: at(10), leftAt: null };
    expect(suggest(block(), { ...one, stretches: [stretch, later] })).toMatchObject({
      issueId: 6,
      confidence: 40,
    });
  });

  it('then a call matching a client, else nothing', () => {
    const call = block({ source: 'call', title: 'Call with FGE', detail: { contact: 'FGE' } });
    const quiet = { ...ctx, rules: [], stretches: [] };
    expect(suggest(call, quiet)).toMatchObject({ initiativeId: 9, confidence: 70 });
    expect(suggest(block(), quiet)).toEqual(NO_SUGGESTION);
  });
});
