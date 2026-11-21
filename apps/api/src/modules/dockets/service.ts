import { db, issueDocket } from '@repo/db';
import { and, desc, eq } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { getIssueProjectId } from '#modules/issues/service';
import { createComment } from '#modules/issues/activity';

type DocketRow = typeof issueDocket.$inferSelect;

export interface DocketDto {
  id: number;
  issueId: number;
  agentRunId: number | null;
  status: 'draft' | 'attached' | 'discarded';
  body: string;
  createdAt: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
}

function toDto(row: DocketRow): DocketDto {
  return {
    id: row.id,
    issueId: row.issueId,
    agentRunId: row.agentRunId,
    status: row.status as DocketDto['status'],
    body: row.body,
    createdAt: iso(row.createdAt),
    decidedByUserId: row.decidedBy,
    decidedAt: row.decidedAt ? iso(row.decidedAt) : null,
  };
}

export async function docketProjectId(docketId: number): Promise<number | null> {
  const [row] = await db
    .select({ issueId: issueDocket.issueId })
    .from(issueDocket)
    .where(eq(issueDocket.id, docketId));
  return row ? getIssueProjectId(row.issueId) : null;
}

export async function listDockets(issueId: number): Promise<DocketDto[]> {
  const rows = await db
    .select()
    .from(issueDocket)
    .where(eq(issueDocket.issueId, issueId))
    .orderBy(desc(issueDocket.id));
  return rows.map(toDto);
}

// Only a draft is decided, once: the conditional update lets one of two concurrent
// decisions through.
async function decide(
  docketId: number,
  userId: string,
  status: 'attached' | 'discarded',
): Promise<DocketRow> {
  const [row] = await db
    .update(issueDocket)
    .set({ status, decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(issueDocket.id, docketId), eq(issueDocket.status, 'draft')))
    .returning();
  if (!row) throw new HttpError(409, 'This docket has already been decided');
  return row;
}

// Adds the docket to the issue as the person's comment.
export async function attachDocket(docketId: number, userId: string): Promise<DocketDto> {
  const row = await decide(docketId, userId, 'attached');
  try {
    await createComment({ issueId: row.issueId, actorUserId: userId, body: row.body });
  } catch (error) {
    await db
      .update(issueDocket)
      .set({ status: 'draft', decidedBy: null, decidedAt: null })
      .where(eq(issueDocket.id, docketId));
    throw error;
  }
  return toDto(row);
}

export async function discardDocket(docketId: number, userId: string): Promise<DocketDto> {
  return toDto(await decide(docketId, userId, 'discarded'));
}
