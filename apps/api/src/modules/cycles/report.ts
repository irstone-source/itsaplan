import { cycle, db, initiative, issue, project, projectColumn } from '@repo/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { HttpError } from '#shared/lib';
import { getCycleBillables } from './billables';

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});
const pounds = (pence: number) => GBP.format(Math.round(pence / 100));

// What one client's work in a cycle came to, as markdown to send them: the tickets
// completed with their value, then what is still open. Canceled and archived
// tickets are left out; values are those of the cycle billables.
export async function getCycleClientReport(
  cycleId: number,
  initiativeId: number,
): Promise<{ markdown: string }> {
  const [c] = await db
    .select({ name: cycle.name, projectId: cycle.projectId })
    .from(cycle)
    .where(eq(cycle.id, cycleId));
  if (!c) throw new HttpError(404, 'Cycle not found');
  const [client] = await db
    .select({ title: initiative.title })
    .from(initiative)
    .where(and(eq(initiative.id, initiativeId), eq(initiative.projectId, c.projectId)));
  if (!client) throw new HttpError(404, 'Initiative not found');

  const values = new Map(
    (await getCycleBillables(cycleId)).issues.map((i) => [i.id, i.valuePence]),
  );
  const rows = await db
    .select({
      id: issue.id,
      key: project.key,
      seq: issue.sequenceNumber,
      title: issue.title,
      stateType: projectColumn.stateType,
    })
    .from(issue)
    .innerJoin(project, eq(project.id, issue.projectId))
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .where(
      and(
        eq(issue.cycleId, cycleId),
        eq(issue.initiativeId, initiativeId),
        isNull(issue.archivedAt),
      ),
    )
    .orderBy(asc(issue.sequenceNumber));

  const line = (r: (typeof rows)[number]) => {
    const value = values.get(r.id);
    return `- ${r.title} (${r.key}-${r.seq})${value ? ` — ${pounds(value)}` : ''}`;
  };
  const done = rows.filter((r) => r.stateType === 'completed');
  const open = rows.filter((r) => r.stateType !== 'completed' && r.stateType !== 'canceled');
  const sum = (list: typeof rows) => list.reduce((s, r) => s + (values.get(r.id) ?? 0), 0);

  const parts = [`# ${client.title} — ${c.name}`, ''];
  parts.push(
    `## Delivered (${done.length})`,
    '',
    ...(done.length ? done.map(line) : ['- Nothing completed yet']),
    '',
  );
  if (open.length) parts.push(`## Still in progress (${open.length})`, '', ...open.map(line), '');
  parts.push(
    `**Delivered value:** ${pounds(sum(done))} of ${pounds(sum(done) + sum(open))} planned.`,
  );
  return { markdown: parts.join('\n') };
}
