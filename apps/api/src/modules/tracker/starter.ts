import type { ImportItem } from './service';

// Cambray's first measures, from the daily stand-up of 5 Oct 2026 and Ian's brief of
// 4 Oct. A target nobody has stated is left unset: its cells stay grey until the target
// setter fills it in.
const START = '2026-10-05';
const ZAK = 'zak@cambraydesign.co.uk';
const JO = 'jo@cambraydesign.co.uk';
const IAN = 'ian@cambraydesign.co.uk';

const weekly = {
  projectKey: 'CON',
  direction: 'at_least',
  cadence: 'week',
  unlockPeriods: 0,
  source: 'manual',
  startsOn: START,
} as const;

export const STARTER_MEASURES: ImportItem[] = [
  // Cambray: its own revenue, by client, against the Finance page's cycle targets.
  {
    ...weekly,
    company: 'Cambray',
    loop: 'Cap loop',
    name: 'Consulting billings',
    definition:
      "Value of client work completed in the week, from It's a Plan: estimate × the client's day rate, or the value set by hand. Ex-VAT.",
    kind: 'outcome',
    unit: 'money',
    source: 'billings',
    ownerEmail: IAN,
    rule: { type: 'finance' },
  },
  ...['GSG', 'FGE', 'Window Supply Direct', 'Lanoguard'].map((client): ImportItem => ({
    ...weekly,
    company: 'Cambray',
    loop: 'Cap loop',
    name: `Billings: ${client}`,
    definition: `Value of ${client} work completed in the week, from It's a Plan, against the initiative's planned value in the cycle. Ex-VAT.`,
    kind: 'outcome',
    unit: 'money',
    source: 'billings',
    initiative: client,
    ownerEmail: IAN,
    rule: { type: 'finance' },
  })),
  {
    ...weekly,
    company: 'Cambray',
    loop: 'Rev loop',
    name: 'Qualified leads from ads',
    definition:
      'Leads reaching the CRM in the week with their source ad known (Meta or Google). Spam, duplicates and unverified Facebook leads excluded.',
    kind: 'outcome',
    unit: 'count',
    ownerEmail: ZAK,
    rule: { type: 'unset' },
  },
  {
    ...weekly,
    company: 'Cambray',
    loop: 'Rev loop',
    name: 'Leads traced to their ad',
    definition:
      'Done when every lead of the week can be traced to the ad it came from (attribution session with Mike; off Zapier). Stand-up 5 Oct: lead flow low, Zapier hides the source.',
    kind: 'activity',
    unit: 'done',
    ownerEmail: ZAK,
    rule: { type: 'unset' },
  },
  {
    ...weekly,
    company: 'Cambray',
    loop: 'Rev loop',
    name: 'Video ad concepts made',
    definition:
      'Hook → meet → CTA video concepts made in Hyperframes and shown at stand-up, in the cinematic architectural style agreed on 5 Oct.',
    kind: 'activity',
    unit: 'count',
    ownerEmail: ZAK,
    rule: { type: 'unset' },
  },
  // Lanoguard: the outreach launched this week, worked back from pallet sales.
  {
    ...weekly,
    company: 'Lanoguard',
    loop: 'Rev loop',
    name: 'Outreach sequence sending',
    definition:
      'Done when the email/LinkedIn sequence (email 1 with proposal link, follow-up, break-up) is sending to the 2,000 contacts.',
    kind: 'activity',
    unit: 'done',
    ownerEmail: IAN,
    rule: { type: 'unset' },
  },
  {
    ...weekly,
    company: 'Lanoguard',
    loop: 'Rev loop',
    name: 'Outreach emails sent',
    definition:
      'Emails sent from the outreach sequences in the week, all mailboxes, from the sending tool.',
    kind: 'activity',
    unit: 'count',
    ownerEmail: ZAK,
    rule: { type: 'unset' },
  },
  {
    ...weekly,
    company: 'Lanoguard',
    loop: 'Rev loop',
    name: 'Engagement rate',
    definition:
      'Contacts who replied, clicked the proposal or booked, as a share of contacts reached in the week. Ian, 5 Oct: about 7% engage.',
    kind: 'engagement',
    unit: 'percent',
    unlockPeriods: 2,
    ownerEmail: IAN,
    rule: { type: 'fixed', value: 7 },
  },
  {
    ...weekly,
    company: 'Lanoguard',
    loop: 'Rev loop',
    name: 'Contacts becoming customers',
    definition:
      'Contacts reached who placed a first order, as a share of contacts reached in the month. Ian, 5 Oct: a couple of percent.',
    kind: 'outcome',
    unit: 'percent',
    cadence: 'month',
    startsOn: '2026-10-01',
    unlockPeriods: 1,
    ownerEmail: IAN,
    rule: { type: 'fixed', value: 2 },
  },
  {
    ...weekly,
    company: 'Lanoguard',
    loop: 'Rev loop',
    name: 'Pallet sales',
    definition:
      'Pallets paid for in the week (Shopify order paid), ex-VAT. Ian, 4 Oct: one a week, worked back.',
    kind: 'outcome',
    unit: 'count',
    ownerEmail: IAN,
    rule: { type: 'fixed', value: 1 },
  },
  // Forever Green Energy.
  {
    ...weekly,
    company: 'Forever Green Energy',
    loop: 'Rev loop',
    name: 'Social posts published',
    definition:
      'Posts published on Forever Green channels in the week. Jo, 5 Oct: one a week, lined up to mid-October.',
    kind: 'activity',
    unit: 'count',
    ownerEmail: JO,
    rule: { type: 'fixed', value: 1 },
  },
  {
    ...weekly,
    company: 'Forever Green Energy',
    loop: 'Rev loop',
    name: 'Case studies published',
    definition:
      'Customer case studies published in the week. Blocked on 5 Oct by the Casey access issue; unblocking it lets Jack scale production.',
    kind: 'activity',
    unit: 'count',
    ownerEmail: JO,
    rule: { type: 'unset' },
  },
  // Window Supply Direct.
  {
    ...weekly,
    company: 'Window Supply Direct',
    loop: 'Rev loop',
    name: 'Email opt-in rate',
    definition:
      'Site visitors who opted in to email, as a share of visitors, in the week. Zak, 5 Oct: the pop-up lifted it from 1.2% to 2.0%; hold that level.',
    kind: 'engagement',
    unit: 'percent',
    ownerEmail: ZAK,
    rule: { type: 'shelf', value: 2 },
  },
  {
    ...weekly,
    company: 'Window Supply Direct',
    loop: 'Rev loop',
    name: 'Online revenue',
    definition:
      'Website orders paid in the month, ex-VAT, from Shopify. Ian, 5 Oct: 5% month-on-month growth needed; set the starting month and figure.',
    kind: 'outcome',
    unit: 'money',
    cadence: 'month',
    startsOn: '2026-10-01',
    ownerEmail: IAN,
    rule: { type: 'unset' },
  },
  // DLB.
  {
    ...weekly,
    company: 'DLB',
    loop: 'Rev loop',
    name: 'Offer page live',
    definition:
      'Done when the 10% off (capped at $150) offer page is live and each opt-in notifies Dan by email. Planned with Tim on 6 Oct.',
    kind: 'activity',
    unit: 'done',
    ownerEmail: JO,
    rule: { type: 'unset' },
  },
  {
    ...weekly,
    company: 'DLB',
    loop: 'Rev loop',
    name: 'Cost per conversion',
    definition:
      'Google Ads cost per conversion across campaigns in the week, from the ads account. A limit: lower is better. Zak, 5 Oct: falling, PMax strong.',
    kind: 'guardrail',
    unit: 'money',
    direction: 'at_most',
    ownerEmail: ZAK,
    rule: { type: 'unset' },
  },
];
