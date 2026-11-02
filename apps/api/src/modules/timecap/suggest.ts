import { issueRefs } from '#modules/rize/match';

// The suggestion engine of time capture, kept free of the database so each rule can be
// tested on its own. The service loads the context (rules, in-progress stretches,
// client initiatives, the ticket a title names) and calls `suggest` per block.

export interface BlockFacts {
  source: string;
  app: string;
  title: string;
  domain: string | null;
  detail: Record<string, unknown>;
  startedAt: Date;
  endedAt: Date;
}

export interface RuleFacts {
  id: number;
  // null: a team rule.
  userId: string | null;
  field: string;
  pattern: string;
  issueId: number | null;
  initiativeId: number | null;
  ignore: boolean;
}

// One stretch one of the person's tickets spent in a started column.
export interface Stretch {
  issueId: number;
  initiativeId: number | null;
  enteredAt: Date;
  leftAt: Date | null;
}

export interface ClientInitiative {
  id: number;
  title: string;
  labels: string[];
}

export interface Ticket {
  id: number;
  identifier: string;
  initiativeId: number | null;
}

export interface Suggestion {
  issueId: number | null;
  initiativeId: number | null;
  confidence: number;
  reason: string;
  ruleId: number | null;
  ignore: boolean;
}

export interface SuggestionContext {
  ticket: Ticket | null;
  rules: RuleFacts[];
  stretches: Stretch[];
  initiatives: ClientInitiative[];
}

export const NO_SUGGESTION: Suggestion = {
  issueId: null,
  initiativeId: null,
  confidence: 0,
  reason: '',
  ruleId: null,
  ignore: false,
};

// The first ticket identifier in a title, e.g. "CON-14".
export function ticketRef(title: string): { key: string; sequenceNumber: number } | null {
  return issueRefs(title)[0] ?? null;
}

// The text of a block a rule's field reads. A call's contact is its detail, else the
// title ("Call with <name>").
export function ruleText(block: BlockFacts, field: string): string | null {
  switch (field) {
    case 'app':
      return block.app;
    case 'title':
      return block.title;
    case 'domain':
      return block.domain;
    case 'contact':
      return callContact(block);
    default:
      return null;
  }
}

export function callContact(block: BlockFacts): string | null {
  if (block.source !== 'call') return null;
  const contact = block.detail.contact;
  if (typeof contact === 'string' && contact.trim()) return contact.trim();
  return block.title.replace(/^call with\s+/i, '').trim() || null;
}

// Personal rules before team rules, longer patterns before shorter ones.
export function orderRules<R extends RuleFacts>(rules: R[]): R[] {
  return [...rules].sort((a, b) => {
    const personal = Number(b.userId !== null) - Number(a.userId !== null);
    return personal !== 0 ? personal : b.pattern.length - a.pattern.length;
  });
}

export function matchRule<R extends RuleFacts>(block: BlockFacts, rules: R[]): R | null {
  for (const rule of orderRules(rules)) {
    const text = ruleText(block, rule.field);
    if (text && text.toLowerCase().includes(rule.pattern.toLowerCase())) return rule;
  }
  return null;
}

// The stretches that overlap the block.
export function stretchesDuring(block: BlockFacts, stretches: Stretch[]): Stretch[] {
  return stretches.filter(
    (s) => s.enteredAt < block.endedAt && (s.leftAt === null || s.leftAt > block.startedAt),
  );
}

// The client an initiative title names: the part before its dash or colon,
// "FGE — 32 sales a month" → "fge".
export function clientName(title: string): string {
  return (title.split(/\s+[—–-]\s+|:/)[0] ?? '').trim().toLowerCase();
}

export function matchCall(
  block: BlockFacts,
  initiatives: ClientInitiative[],
): ClientInitiative | null {
  const contact = callContact(block);
  if (!contact) return null;
  const number = typeof block.detail.number === 'string' ? block.detail.number.trim() : '';
  const needles = [contact.toLowerCase(), number.toLowerCase()].filter(Boolean);
  for (const initiative of initiatives) {
    const client = clientName(initiative.title);
    const labels = initiative.labels.map((l) => l.toLowerCase());
    for (const needle of needles) {
      if (labels.includes(needle)) return initiative;
      if (client && (needle.includes(client) || client.includes(needle))) return initiative;
    }
  }
  return null;
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'before',
  'chrome',
  'document',
  'edit',
  'file',
  'from',
  'google',
  'home',
  'into',
  'mail',
  'meeting',
  'microsoft',
  'mozilla',
  'firefox',
  'safari',
  'new',
  'page',
  'that',
  'this',
  'untitled',
  'window',
  'with',
  'your',
]);

// The longest word of at least four letters that is not a common title word; what a
// remembered rule matches when the block has no domain.
export function distinctiveWord(title: string): string | null {
  const words = title
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  if (words.length === 0) return null;
  return words.reduce((best, w) => (w.length > best.length ? w : best));
}

// The suggestion for a block, in the order of the plan: a ticket id in the title, a
// rule, an in-progress ticket, a call matching a client, else none.
export function suggest(block: BlockFacts, ctx: SuggestionContext): Suggestion {
  if (ctx.ticket) {
    return {
      ...NO_SUGGESTION,
      issueId: ctx.ticket.id,
      initiativeId: ctx.ticket.initiativeId,
      confidence: 95,
      reason: `Ticket ${ctx.ticket.identifier} in the title`,
    };
  }
  const rule = matchRule(block, ctx.rules);
  if (rule) {
    return {
      issueId: rule.issueId,
      initiativeId: rule.initiativeId,
      confidence: 85,
      reason: `${rule.userId ? 'Rule' : 'Team rule'}: ${rule.field} contains "${rule.pattern}"`,
      ruleId: rule.id,
      ignore: rule.ignore,
    };
  }
  const during = stretchesDuring(block, ctx.stretches);
  if (during.length > 0) {
    const latest = during.reduce((a, b) => (b.enteredAt > a.enteredAt ? b : a));
    return {
      ...NO_SUGGESTION,
      issueId: latest.issueId,
      initiativeId: latest.initiativeId,
      confidence: during.length === 1 ? 60 : 40,
      reason:
        during.length === 1
          ? 'In progress during the block'
          : `The latest of ${during.length} tickets in progress`,
    };
  }
  const initiative = matchCall(block, ctx.initiatives);
  if (initiative) {
    return {
      ...NO_SUGGESTION,
      initiativeId: initiative.id,
      confidence: 70,
      reason: `Call with ${callContact(block)} matches ${initiative.title}`,
    };
  }
  return NO_SUGGESTION;
}
