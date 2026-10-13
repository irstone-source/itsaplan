import { db, initiative, label } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { createInitiative, updateInitiative } from '#modules/initiatives/service';
import { createLabel } from '#modules/labels/service';
import { createPlaybookItem, listPlaybook, type PlaybookItemInput } from './service';

export interface ImportRow {
  client: string;
  deliverable: string;
  price?: string;
  billing?: string;
  cadence?: string;
  quarterMonth?: string;
  estimateHours?: string;
  measure?: string;
}

export interface ImportAction {
  kind: 'class' | 'label' | 'initiative' | 'item' | 'skip';
  text: string;
}

// The clients whose initiatives get a revenue class when they have none.
const COMMITTED = ['GSG', 'FGE', 'Window Supply Direct', 'Lanoguard'];
const NEW = ['Cotswold Wellness', 'Bike Ventures'];

export const MGM_TITLE = 'MGM — Consulting management';
const MGM_DESCRIPTION = [
  '**Goal.** Run the consultancy to the year revenue target and above break-even each month (Finance page).',
  '',
  '**We measure.** The North Star measures on the tracker; billings against each cycle target; committed vs new revenue; capacity used against the reserve.',
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
const MGM_ITEMS: Omit<PlaybookItemInput, 'initiativeId'>[] = [
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

const clientOf = (title: string) => title.split(' — ')[0]!.trim().toLowerCase();
const BILLING = ['billable', 'retainer', 'non_billable'];
const CADENCE = ['monthly', 'quarterly', 'ad_hoc'];

// A playbook loaded from rows of a spreadsheet. With `setup`, it also gives the
// known clients their revenue class, creates the MGM initiative, label and items,
// a quarterly strategic review and a monthly outcome review per committed client
// (the quarterly ones a month apart), and the scope change label. An item
// whose title its initiative already has is skipped, so a rerun adds nothing new.
// Without `apply` it only reports what it would do.
export async function importPlaybook(
  projectId: number,
  input: { rows: ImportRow[]; setup: boolean; apply: boolean },
  actorUserId: string,
): Promise<{ actions: ImportAction[] }> {
  const { apply } = input;
  const actions: ImportAction[] = [];
  const initiatives = await db
    .select({
      id: initiative.id,
      title: initiative.title,
      revenueClass: initiative.revenueClass,
    })
    .from(initiative)
    .where(eq(initiative.projectId, projectId));
  const existing = new Set(
    (await listPlaybook(projectId)).flatMap((g) =>
      g.items.map((i) => `${g.initiativeId}|${i.title.toLowerCase()}`),
    ),
  );
  const find = (client: string) =>
    initiatives.filter((i) => clientOf(i.title) === client.trim().toLowerCase());

  async function addItem(
    target: { id: number; title: string },
    item: Omit<PlaybookItemInput, 'initiativeId'>,
  ) {
    const key = `${target.id}|${item.title!.toLowerCase()}`;
    if (existing.has(key)) {
      actions.push({
        kind: 'skip',
        text: `${target.title}: ${item.title} (already in the playbook)`,
      });
      return;
    }
    existing.add(key);
    actions.push({ kind: 'item', text: `${target.title}: ${item.title}` });
    if (apply && target.id > 0)
      await createPlaybookItem(projectId, { ...item, title: item.title!, initiativeId: target.id });
  }

  if (input.setup) {
    for (const [names, revenueClass] of [
      [COMMITTED, 'committed'],
      [NEW, 'new'],
    ] as const) {
      for (const name of names) {
        for (const i of find(name).filter((x) => !x.revenueClass)) {
          actions.push({ kind: 'class', text: `${i.title} → ${revenueClass}` });
          if (apply) await updateInitiative(i.id, { revenueClass }, actorUserId);
          i.revenueClass = revenueClass;
        }
      }
    }

    const [found] = await db
      .select({ id: label.id })
      .from(label)
      .where(and(eq(label.projectId, projectId), eq(label.name, 'MGM')));
    let mgmLabelId = found?.id ?? null;
    if (!found) {
      actions.push({ kind: 'label', text: 'MGM' });
      if (apply) mgmLabelId = (await createLabel({ projectId, name: 'MGM', color: '#64748b' })).id;
    }
    let mgm = initiatives.find((i) => i.title === MGM_TITLE);
    if (!mgm) {
      actions.push({ kind: 'initiative', text: MGM_TITLE });
      // Until it exists (a plan), id 0 stands in so its items are listed but not written.
      mgm = { id: 0, title: MGM_TITLE, revenueClass: 'management' };
      if (apply) {
        const created = await createInitiative(
          projectId,
          {
            title: MGM_TITLE,
            description: MGM_DESCRIPTION,
            status: 'active',
            billingModel: 'internal',
            revenueClass: 'management',
            labelIds: mgmLabelId ? [mgmLabelId] : [],
          },
          actorUserId,
        );
        mgm = { id: created.id, title: created.title, revenueClass: 'management' };
      }
      initiatives.push(mgm);
    }
    for (const item of MGM_ITEMS)
      await addItem(mgm, {
        billing: 'non_billable',
        labelIds: mgmLabelId ? [mgmLabelId] : [],
        ...item,
      });

    let month = 1;
    for (const i of initiatives.filter((x) => x.revenueClass === 'committed')) {
      await addItem(i, {
        title: 'Quarterly strategic review',
        billing: 'retainer',
        cadence: 'quarterly',
        quarterMonth: month,
        estimateMinutes: 240,
      });
      await addItem(i, {
        title: 'Monthly outcome review',
        description:
          'Outcomes delivered, hours against allocation, effective rate, margin and scope changes; then the client report.',
        billing: 'retainer',
        cadence: 'monthly',
        estimateMinutes: 60,
      });
      month = (month % 3) + 1;
    }

    // Requests outside a client's outcome list are tagged with this label.
    const [scope] = await db
      .select({ id: label.id })
      .from(label)
      .where(and(eq(label.projectId, projectId), eq(label.name, 'scope change')));
    if (!scope) {
      actions.push({ kind: 'label', text: 'scope change' });
      if (apply) await createLabel({ projectId, name: 'scope change', color: '#c8772b' });
    }
  }

  for (const row of input.rows) {
    const title = row.deliverable.trim();
    const matches = find(row.client);
    if (!row.client.trim() || !title) {
      actions.push({ kind: 'skip', text: 'A row without a client or a deliverable' });
      continue;
    }
    if (matches.length !== 1) {
      actions.push({
        kind: 'skip',
        text: `${row.client}: ${matches.length === 0 ? 'no initiative' : 'several initiatives'} match "${row.client} — …" (${title})`,
      });
      continue;
    }
    const price = Math.round(Number((row.price ?? '').replace(/[£,\s]/g, '') || 0) * 100);
    const hours = row.estimateHours?.trim() ? Number(row.estimateHours) : null;
    const quarterMonth = Number(row.quarterMonth);
    await addItem(matches[0]!, {
      title,
      pricePence: Number.isFinite(price) && price >= 0 ? price : 0,
      billing: BILLING.includes(row.billing?.trim() ?? '') ? row.billing!.trim() : 'billable',
      cadence: CADENCE.includes(row.cadence?.trim() ?? '') ? row.cadence!.trim() : 'monthly',
      quarterMonth: quarterMonth >= 1 && quarterMonth <= 3 ? quarterMonth : 1,
      estimateMinutes:
        hours != null && Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 60) : null,
      measure: row.measure?.trim() ?? '',
    });
  }
  return { actions };
}
