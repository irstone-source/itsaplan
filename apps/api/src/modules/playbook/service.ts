import {
  cycle,
  db,
  initiative,
  issue,
  issueType,
  label,
  playbookItem,
  playbookItemLabel,
  projectColumn,
} from '@repo/db';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { HttpError } from '#shared/lib';
import { createIssue } from '#modules/issues/service';
import { getProjectById } from '#modules/projects/service';

export interface PlaybookItemRow {
  id: number;
  initiativeId: number;
  title: string;
  description: string;
  pricePence: number;
  billing: string;
  estimateMinutes: number | null;
  cadence: string;
  quarterMonth: number;
  typeId: number | null;
  labelIds: number[];
  active: boolean;
  position: number;
  stripePriceId: string | null;
}

export interface PlaybookGroup {
  initiativeId: number;
  title: string;
  billingModel: string | null;
  revenueClass: string | null;
  monthlyFeePence: number | null;
  monthlyPricedPence: number;
  items: PlaybookItemRow[];
}

export interface PlaybookItemInput {
  initiativeId: number;
  title: string;
  description?: string;
  pricePence?: number;
  billing?: string;
  estimateMinutes?: number | null;
  cadence?: string;
  quarterMonth?: number;
  typeId?: number | null;
  labelIds?: number[];
  active?: boolean;
  position?: number;
}

async function selectItems(projectId: number, ids?: number[]): Promise<PlaybookItemRow[]> {
  const rows = await db
    .select()
    .from(playbookItem)
    .where(
      ids
        ? and(eq(playbookItem.projectId, projectId), inArray(playbookItem.id, ids))
        : eq(playbookItem.projectId, projectId),
    )
    .orderBy(asc(playbookItem.position), asc(playbookItem.id));
  if (rows.length === 0) return [];
  const labels = await db
    .select()
    .from(playbookItemLabel)
    .where(
      inArray(
        playbookItemLabel.itemId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    initiativeId: r.initiativeId,
    title: r.title,
    description: r.description,
    pricePence: r.pricePence,
    billing: r.billing,
    estimateMinutes: r.estimateMinutes,
    cadence: r.cadence,
    quarterMonth: r.quarterMonth,
    typeId: r.typeId,
    labelIds: labels.filter((l) => l.itemId === r.id).map((l) => l.labelId),
    active: r.active,
    position: r.position,
    stripePriceId: r.stripePriceId,
  }));
}

// What an item adds to a month: its price when monthly, a third when quarterly.
function monthlyShare(item: PlaybookItemRow): number {
  if (!item.active || item.billing === 'non_billable') return 0;
  if (item.cadence === 'monthly') return item.pricePence;
  if (item.cadence === 'quarterly') return Math.round(item.pricePence / 3);
  return 0;
}

// A project's playbook, one group per initiative that has items, committed clients
// first, then new ones, then the rest.
export async function listPlaybook(projectId: number): Promise<PlaybookGroup[]> {
  const items = await selectItems(projectId);
  if (items.length === 0) return [];
  const initiatives = await db
    .select()
    .from(initiative)
    .where(inArray(initiative.id, [...new Set(items.map((i) => i.initiativeId))]));
  const order = (c: string | null) => ['committed', 'new', 'management'].indexOf(c ?? '') + 1 || 4;
  return initiatives
    .map((i) => {
      const own = items.filter((item) => item.initiativeId === i.id);
      return {
        initiativeId: i.id,
        title: i.title,
        billingModel: i.billingModel,
        revenueClass: i.revenueClass,
        monthlyFeePence: i.monthlyFeePence,
        monthlyPricedPence: own.reduce((sum, item) => sum + monthlyShare(item), 0),
        items: own,
      };
    })
    .sort(
      (a, b) => order(a.revenueClass) - order(b.revenueClass) || a.title.localeCompare(b.title),
    );
}

async function assertItemRefs(projectId: number, input: Partial<PlaybookItemInput>): Promise<void> {
  if (input.initiativeId != null) {
    const rows = await db
      .select({ id: initiative.id })
      .from(initiative)
      .where(and(eq(initiative.id, input.initiativeId), eq(initiative.projectId, projectId)));
    if (rows.length === 0) throw new HttpError(400, 'Initiative must belong to this project');
  }
  if (input.typeId != null) {
    const rows = await db
      .select({ id: issueType.id })
      .from(issueType)
      .where(and(eq(issueType.id, input.typeId), eq(issueType.projectId, projectId)));
    if (rows.length === 0) throw new HttpError(400, 'Issue type must belong to this project');
  }
  const labelIds = [...new Set(input.labelIds ?? [])];
  if (labelIds.length > 0) {
    const rows = await db
      .select({ id: label.id })
      .from(label)
      .where(and(eq(label.projectId, projectId), inArray(label.id, labelIds)));
    if (rows.length !== labelIds.length)
      throw new HttpError(400, 'Labels must belong to this project');
  }
}

async function setItemLabels(itemId: number, labelIds: number[]): Promise<void> {
  const next = [...new Set(labelIds)];
  await db.delete(playbookItemLabel).where(eq(playbookItemLabel.itemId, itemId));
  if (next.length > 0)
    await db.insert(playbookItemLabel).values(next.map((labelId) => ({ itemId, labelId })));
}

export async function createPlaybookItem(
  projectId: number,
  input: PlaybookItemInput,
): Promise<PlaybookItemRow> {
  await assertItemRefs(projectId, input);
  const [row] = await db
    .insert(playbookItem)
    .values({
      projectId,
      initiativeId: input.initiativeId,
      title: input.title,
      description: input.description ?? '',
      pricePence: input.pricePence ?? 0,
      billing: input.billing ?? 'billable',
      estimateMinutes: input.estimateMinutes ?? null,
      cadence: input.cadence ?? 'monthly',
      quarterMonth: input.quarterMonth ?? 1,
      typeId: input.typeId ?? null,
      active: input.active ?? true,
      position: input.position ?? Date.now() / 1000,
    })
    .returning({ id: playbookItem.id });
  if (input.labelIds?.length) await setItemLabels(row.id, input.labelIds);
  return (await selectItems(projectId, [row.id]))[0]!;
}

// Returns null when the project holds no item of that id. A property left out of the
// patch keeps its value; labelIds replaces the whole set.
export async function updatePlaybookItem(
  projectId: number,
  id: number,
  patch: Partial<PlaybookItemInput>,
): Promise<PlaybookItemRow | null> {
  const [current] = await selectItems(projectId, [id]);
  if (!current) return null;
  await assertItemRefs(projectId, patch);
  const { labelIds, ...fields } = patch;
  if (Object.keys(fields).length > 0)
    await db
      .update(playbookItem)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(playbookItem.id, id), eq(playbookItem.projectId, projectId)));
  if (labelIds) await setItemLabels(id, labelIds);
  return (await selectItems(projectId, [id]))[0]!;
}

export async function deletePlaybookItem(projectId: number, id: number): Promise<boolean> {
  const deleted = await db
    .delete(playbookItem)
    .where(and(eq(playbookItem.id, id), eq(playbookItem.projectId, projectId)))
    .returning({ id: playbookItem.id });
  return deleted.length > 0;
}

// Whether an item falls due in a month (1-12): monthly items every month, quarterly
// items in their month of the quarter.
export function isDue(item: Pick<PlaybookItemRow, 'cadence' | 'quarterMonth'>, month: number) {
  if (item.cadence === 'monthly') return true;
  if (item.cadence === 'quarterly') return ((month - 1) % 3) + 1 === item.quarterMonth;
  return false;
}

async function cycleRow(cycleId: number) {
  const [row] = await db
    .select({ projectId: cycle.projectId, startDate: cycle.startDate })
    .from(cycle)
    .where(eq(cycle.id, cycleId));
  if (!row) throw new HttpError(404, 'Cycle not found');
  return row;
}

async function addedToCycle(cycleId: number) {
  return db
    .select({ itemId: issue.playbookItemId, issueId: issue.id })
    .from(issue)
    .where(and(eq(issue.cycleId, cycleId), isNotNull(issue.playbookItemId)));
}

// The playbook as it stands for one cycle: what its month makes due and is not in it
// yet, the ad-hoc items, and what is already in it. The month is the start date's.
export async function getCyclePlaybook(cycleId: number) {
  const c = await cycleRow(cycleId);
  const month = Number(c.startDate.slice(5, 7));
  const added = (await addedToCycle(cycleId)).map((a) => ({
    itemId: a.itemId!,
    issueId: a.issueId,
  }));
  const inCycle = new Set(added.map((a) => a.itemId));
  const items = (await selectItems(c.projectId)).filter((i) => i.active);
  return {
    due: items.filter((i) => isDue(i, month) && !inCycle.has(i.id)),
    adHoc: items.filter((i) => i.cadence === 'ad_hoc' && !inCycle.has(i.id)),
    added,
  };
}

// The column a new playbook issue starts in: the project's first unstarted column,
// else its first backlog column.
async function startColumn(projectId: number): Promise<number> {
  const columns = await db
    .select({ id: projectColumn.id, stateType: projectColumn.stateType })
    .from(projectColumn)
    .where(eq(projectColumn.projectId, projectId))
    .orderBy(asc(projectColumn.position));
  const column =
    columns.find((c) => c.stateType === 'unstarted') ??
    columns.find((c) => c.stateType === 'backlog');
  if (!column) throw new HttpError(409, 'The project has no unstarted or backlog column');
  return column.id;
}

// The value an item's issue carries: its price, except a non-billable item, which
// adds nothing to client billings and on internal work is costed from its estimate.
function valueFor(item: PlaybookItemRow, internal: boolean): number | null {
  if (item.billing !== 'non_billable') return item.pricePence;
  return internal ? null : 0;
}

// Creates one issue per item in the cycle, under the item's initiative, valued at
// its price (see valueFor). An item already in the cycle, or not
// in the cycle's project, is skipped.
export async function addPlaybookToCycle(
  cycleId: number,
  itemIds: number[],
  actorUserId: string,
): Promise<{ created: { itemId: number; issueId: number }[]; skipped: number[] }> {
  const c = await cycleRow(cycleId);
  const project = (await getProjectById(c.projectId))!;
  const items = await selectItems(c.projectId, [...new Set(itemIds)]);
  const inCycle = new Set((await addedToCycle(cycleId)).map((a) => a.itemId));
  const columnId = await startColumn(c.projectId);
  const internal = new Set(
    (
      await db
        .select({ id: initiative.id })
        .from(initiative)
        .where(and(eq(initiative.projectId, c.projectId), eq(initiative.billingModel, 'internal')))
    ).map((i) => i.id),
  );
  const created: { itemId: number; issueId: number }[] = [];
  for (const item of items) {
    if (inCycle.has(item.id)) continue;
    const row = await createIssue(
      project,
      {
        columnId,
        cycleId,
        initiativeId: item.initiativeId,
        typeId: item.typeId,
        title: item.title,
        description: item.description,
        estimateMinutes: item.estimateMinutes,
        valueOverridePence: valueFor(item, project.internal || internal.has(item.initiativeId)),
        labelIds: item.labelIds,
      },
      actorUserId,
    );
    await db.update(issue).set({ playbookItemId: item.id }).where(eq(issue.id, row.id));
    created.push({ itemId: item.id, issueId: row.id });
  }
  const done = new Set(created.map((c) => c.itemId));
  return { created, skipped: itemIds.filter((id) => !done.has(id)) };
}
