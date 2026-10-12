#!/usr/bin/env bun
// Loads the playbook of CON on plan.cambray.co from a CSV of repeatable tasks, and
// sets up the MGM consulting-management initiative with its own items.
//
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/import-playbook.ts tasks.csv           plan
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/import-playbook.ts tasks.csv --apply   write
//   ... bun scripts/import-playbook.ts --apply                                                                      MGM and reviews only
//
// CSV header (any order, case ignored): client, deliverable, price, billing, cadence,
// quarter_month, estimate_hours. client is the part of an initiative title before
// " — " (e.g. "GSG"); price is in pounds; billing is billable | retainer | non_billable;
// cadence is monthly | quarterly | ad_hoc. Only client and deliverable are required.
//
// Also, when missing:
// - revenue classes on the client initiatives named in COMMITTED and NEW;
// - a quarterly strategic review for each committed client, quarter months staggered;
// - the MGM initiative, the MGM label and the MGM items.
// An item whose title the initiative already has is skipped, so the script is safe to rerun.

/* eslint-disable @typescript-eslint/no-explicit-any -- a one-off ops script over the API's JSON */

const API = process.env.API_URL ?? 'https://plan-api.cambray.co';
const KEY = process.env.ITSAPLAN_API_KEY;
const PROJECT = process.env.PROJECT_KEY ?? 'CON';
const APPLY = process.argv.includes('--apply');
const CSV_PATH = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!KEY) throw new Error('Set ITSAPLAN_API_KEY.');

const COMMITTED = ['GSG', 'FGE', 'Window Supply Direct', 'Lanoguard'];
const NEW = ['Cotswold Wellness', 'Bike Ventures'];

const MGM_TITLE = 'MGM — Consulting management';
const MGM_DESCRIPTION = [
  '**Goal.** Run the consultancy to the year revenue target and above break-even each month (Finance page).',
  '',
  '**We measure.** The North Star measures on the tracker; billings against each cycle target; committed vs new revenue; capacity used against the 20% reserve.',
  '',
  '**Control.** Monthly cycle planning and close; month-end finance review; quarterly portfolio review.',
  '',
  '**Tickets by workstream**',
  '- Financial: billing and invoicing, finance review, retainer fee balance',
  '- Operational: cycle planning, cycle close and client reports, playbook upkeep',
  '- Strategic: quarterly portfolio review',
  '',
  '**Open.** Internal day rate for costing management time: not set yet (Ian).',
].join('\n');
const MGM_ITEMS = [
  { title: 'Monthly billing and invoicing run', estimateMinutes: 120 },
  { title: 'Month-end finance review: billings vs target, break-even, pool', estimateMinutes: 90 },
  { title: 'Retainer fee balance check: priced items vs fee per client', estimateMinutes: 60 },
  {
    title: 'Cycle planning: add due playbook items, check capacity and reserve',
    estimateMinutes: 90,
  },
  { title: 'Cycle close and client outcome reports', estimateMinutes: 120 },
  { title: 'Playbook upkeep: prices, cadence, billable status', estimateMinutes: 60 },
  {
    title: 'Quarterly portfolio review: outcomes, committed vs new, room for new clients',
    estimateMinutes: 180,
    cadence: 'quarterly',
    quarterMonth: 3,
  },
];

async function api(method: string, path: string, body?: unknown): Promise<any> {
  await Bun.sleep(100);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'x-api-key': KEY!, 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}
const write = async (label: string, method: string, path: string, body?: unknown) => {
  console.log(`${APPLY ? 'apply' : 'plan '}  ${label}`);
  return APPLY ? api(method, path, body) : undefined;
};

// A small CSV reader: quoted fields, doubled quotes inside them, CRLF or LF.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field || row.length) endRow();
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = (header ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  // A row with more cells than the header has an unquoted comma (e.g. £1,200) and
  // its fields have shifted, so it is flagged rather than read.
  return body.map((r) => ({
    ...Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])),
    ...(r.length > keys.length ? { __shifted: r.join(',') } : {}),
  }));
}

const clientOf = (title: string) => title.split(' — ')[0]!.trim().toLowerCase();

const projects: any[] = await api('GET', '/projects');
const project = (Array.isArray(projects) ? projects : (projects as any).items).find(
  (p: any) => p.key === PROJECT,
);
if (!project) throw new Error(`No project ${PROJECT} on ${API}.`);
const ref = project.ref;
let initiatives: any[] = (await api('GET', `/projects/${ref}/initiatives?pageSize=100`)).items;
const playbook: any[] = await api('GET', `/projects/${ref}/playbook`);
const existing = new Set(
  playbook.flatMap((g) => g.items.map((i: any) => `${g.initiativeId}|${i.title.toLowerCase()}`)),
);
const find = (client: string) =>
  initiatives.filter((i) => clientOf(i.title) === client.toLowerCase());

async function addItem(initiative: any, item: Record<string, unknown>) {
  const key = `${initiative.id}|${String(item.title).toLowerCase()}`;
  if (existing.has(key)) return console.log(`skip   ${initiative.title}: ${item.title}`);
  existing.add(key);
  await write(`item   ${initiative.title}: ${item.title}`, 'POST', `/projects/${ref}/playbook`, {
    initiativeId: initiative.id,
    ...item,
  });
}

// Revenue classes, where unset.
for (const [names, revenueClass] of [
  [COMMITTED, 'committed'],
  [NEW, 'new'],
] as const) {
  for (const name of names) {
    for (const i of find(name).filter((x) => !x.revenueClass)) {
      await write(`class  ${i.title} → ${revenueClass}`, 'PATCH', `/initiatives/${i.id}`, {
        revenueClass,
      });
      i.revenueClass = revenueClass;
    }
  }
}

// MGM: label, initiative, items.
const labels: any[] = (await api('GET', `/projects/${ref}`)).labels ?? [];
let mgmLabel = labels.find((l) => l.name === 'MGM');
if (!mgmLabel)
  mgmLabel = await write('label  MGM', 'POST', `/projects/${ref}/labels`, {
    name: 'MGM',
    color: '#64748b',
  });
let mgm = initiatives.find((i) => i.title === MGM_TITLE);
if (!mgm) {
  mgm = await write(`init   ${MGM_TITLE}`, 'POST', `/projects/${ref}/initiatives`, {
    title: MGM_TITLE,
    description: MGM_DESCRIPTION,
    status: 'active',
    billingModel: 'internal',
    revenueClass: 'management',
    labelIds: mgmLabel ? [mgmLabel.id] : [],
  });
  if (mgm) initiatives = [...initiatives, mgm];
}
if (mgm) {
  for (const item of MGM_ITEMS)
    await addItem(mgm, {
      billing: 'non_billable',
      labelIds: mgmLabel ? [mgmLabel.id] : [],
      ...item,
    });
} else console.log('plan   MGM items, once the initiative exists');

// A quarterly strategic review per committed client, a month apart.
let month = 1;
for (const i of initiatives.filter((x) => x.revenueClass === 'committed')) {
  await addItem(i, {
    title: 'Quarterly strategic review',
    billing: 'retainer',
    cadence: 'quarterly',
    quarterMonth: month,
    estimateMinutes: 240,
  });
  month = (month % 3) + 1;
}

// The CSV.
if (CSV_PATH) {
  const rows = parseCsv(await Bun.file(CSV_PATH).text());
  for (const row of rows) {
    if (row.__shifted) {
      console.log(
        `skip   row with more cells than the header (quote prices with commas): ${row.__shifted}`,
      );
      continue;
    }
    const client = row.client ?? '';
    const title = row.deliverable ?? row.task ?? row.title ?? '';
    if (!client || !title) {
      console.log(`skip   row without client or deliverable: ${JSON.stringify(row)}`);
      continue;
    }
    const matches = find(client);
    if (matches.length !== 1) {
      console.log(`skip   ${client}: ${matches.length} initiatives match — ${title}`);
      continue;
    }
    const price = row.price ? Math.round(Number(row.price.replace(/[£,]/g, '')) * 100) : 0;
    const hours = row.estimate_hours ? Number(row.estimate_hours) : null;
    await addItem(matches[0], {
      title,
      pricePence: Number.isFinite(price) ? price : 0,
      billing: ['billable', 'retainer', 'non_billable'].includes(row.billing ?? '')
        ? row.billing
        : 'billable',
      cadence: ['monthly', 'quarterly', 'ad_hoc'].includes(row.cadence ?? '')
        ? row.cadence
        : 'monthly',
      quarterMonth:
        Number(row.quarter_month) >= 1 && Number(row.quarter_month) <= 3
          ? Number(row.quarter_month)
          : 1,
      estimateMinutes: hours != null && Number.isFinite(hours) ? Math.round(hours * 60) : null,
    });
  }
}

console.log(APPLY ? 'Done.' : 'Plan only. Rerun with --apply to write.');
