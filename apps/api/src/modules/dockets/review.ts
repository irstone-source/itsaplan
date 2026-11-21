import { db, issue, issueDocket, issueLabel, label, projectColumn } from '@repo/db';
import { and, asc, eq, gt } from 'drizzle-orm';
import { HttpError } from '#shared/lib';
import { checkPermission, type AuthUser } from '#shared/access';
import { hasPermission } from '#shared/permissions';
import { createComment, deleteComment, userName } from '#modules/issues/activity';
import { getIssue, getIssueProjectId, setIssueLabels, updateIssue } from '#modules/issues/service';
import { listMemberContexts } from '#modules/members/service';
import { notifyCommentTo } from '#modules/notifications/service';
import { quiet } from './draft';
import { docketLabel } from './stamp';

const AT_RISK = 'At risk';
const AT_RISK_COLOR = '#dc2626';

// A lead reviews dockets: the instance owner, or anyone with workflow_config edit.
export async function mayReview(projectId: number, user: AuthUser): Promise<boolean> {
  return user.role === 'god' || checkPermission(projectId, user, 'workflow_config', 'edit');
}

async function firstColumn(projectId: number, stateType: 'completed' | 'started') {
  const [row] = await db
    .select({ id: projectColumn.id })
    .from(projectColumn)
    .where(and(eq(projectColumn.projectId, projectId), eq(projectColumn.stateType, stateType)))
    .orderBy(asc(projectColumn.position))
    .limit(1);
  return row?.id ?? null;
}

async function issueLabelIds(issueId: number): Promise<number[]> {
  const rows = await db
    .select({ id: issueLabel.labelId })
    .from(issueLabel)
    .where(eq(issueLabel.issueId, issueId));
  return rows.map((r) => r.id);
}

async function findAtRisk(projectId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: label.id })
    .from(label)
    .where(and(eq(label.projectId, projectId), eq(label.name, AT_RISK)));
  return row?.id ?? null;
}

// Label names are unique per project, so of two concurrent creates one inserts and both
// read the same row.
async function atRiskLabel(projectId: number): Promise<number> {
  const found = await findAtRisk(projectId);
  if (found != null) return found;
  await db
    .insert(label)
    .values({ projectId, name: AT_RISK, color: AT_RISK_COLOR })
    .onConflictDoNothing();
  return (await findAtRisk(projectId))!;
}

// A blocked docket tells the assignee and the project's leads, and marks the issue at risk.
export async function flagBlocked(
  projectId: number,
  comment: { issueId: number; id: number; actorUserId: string | null },
): Promise<void> {
  const [row] = await db
    .select({ assignee: issue.assigneeUserId })
    .from(issue)
    .where(eq(issue.id, comment.issueId));
  const leads = [...(await listMemberContexts(projectId))]
    .filter(
      ([, ctx]) =>
        ctx.role === 'owner' || hasPermission(ctx.permissions, 'workflow_config', 'edit'),
    )
    .map(([userId]) => userId);
  await notifyCommentTo(projectId, comment, [row?.assignee ?? null, ...leads]);
  const labelId = await atRiskLabel(projectId);
  const current = await issueLabelIds(comment.issueId);
  if (!current.includes(labelId)) {
    await setIssueLabels(projectId, comment.issueId, [...current, labelId], comment.actorUserId);
  }
}

// Approval clears "At risk" unless a blocked docket was stamped after the approved one.
async function clearAtRisk(
  projectId: number,
  docket: typeof issueDocket.$inferSelect,
  actorUserId: string,
): Promise<void> {
  const labelId = await findAtRisk(projectId);
  if (labelId == null) return;
  const current = await issueLabelIds(docket.issueId);
  if (!current.includes(labelId)) return;
  const [later] = await db
    .select({ id: issueDocket.id })
    .from(issueDocket)
    .where(
      and(
        eq(issueDocket.issueId, docket.issueId),
        eq(issueDocket.outcome, 'blocked'),
        gt(issueDocket.stampedAt, docket.stampedAt!),
      ),
    )
    .limit(1);
  if (later) return;
  await setIssueLabels(
    projectId,
    docket.issueId,
    current.filter((id) => id !== labelId),
    actorUserId,
  );
}

// Approve moves the issue to the first completed column; return moves it back to the
// first started column. Either way the issue gets a comment and the author is told. The
// conditional update lets one of two concurrent reviews through; if a later step fails,
// the comment, the move and the labels are put back and the docket waits for review again.
export async function reviewDocket(
  docketId: number,
  reviewerId: string,
  decision: 'approve' | 'return',
  rawNote: string | undefined,
): Promise<void> {
  const note = rawNote?.trim() || null;
  if (decision === 'return' && !note) {
    throw new HttpError(400, 'Say why the docket is returned');
  }
  const [current] = await db
    .select({ authorUserId: issueDocket.authorUserId })
    .from(issueDocket)
    .where(eq(issueDocket.id, docketId));
  if (current?.authorUserId === reviewerId) {
    throw new HttpError(403, 'A docket is reviewed by someone other than its author');
  }
  const [row] = await db
    .update(issueDocket)
    .set({
      reviewStatus: decision === 'approve' ? 'approved' : 'returned',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    })
    .where(and(eq(issueDocket.id, docketId), eq(issueDocket.reviewStatus, 'pending')))
    .returning();
  if (!row) throw new HttpError(409, 'This docket is not waiting for review');
  const projectId = (await getIssueProjectId(row.issueId))!;
  const before = (await getIssue(row.issueId))!;
  let commentId: number | null = null;
  try {
    const stateType = decision === 'approve' ? 'completed' : 'started';
    const target = await firstColumn(projectId, stateType);
    let notMoved: string | null = null;
    if (target == null) {
      notMoved = `the project has no ${stateType} column`;
    } else {
      const after = await updateIssue(row.issueId, { columnId: target }, reviewerId, {
        skipIfColumnFull: true,
      });
      if (after?.columnId !== target) notMoved = 'the column is at its WIP limit';
    }
    if (decision === 'approve') await clearAtRisk(projectId, row, reviewerId);
    const who = quiet((await userName(reviewerId)) ?? 'a reviewer');
    const verb = decision === 'approve' ? 'Approved' : 'Returned';
    const comment = await createComment({
      issueId: row.issueId,
      actorUserId: reviewerId,
      body:
        `${docketLabel(row.number)} · ${verb} by ${who}${note ? `: ${quiet(note)}` : ''}` +
        `${notMoved ? ` (ticket not moved: ${notMoved})` : ''} · [Open docket](/docket/${row.id})`,
    });
    commentId = comment.id;
    await notifyCommentTo(projectId, comment, [row.authorUserId]);
    await db
      .update(issueDocket)
      .set({ reviewMoved: notMoved == null })
      .where(eq(issueDocket.id, docketId));
  } catch (error) {
    const undo = async (step: () => Promise<unknown>) =>
      step().catch((e) => console.error('[dockets] undoing a failed review:', e));
    if (commentId != null) await undo(() => deleteComment(commentId!, reviewerId, projectId));
    await undo(() => updateIssue(row.issueId, { columnId: before.columnId }, reviewerId));
    await undo(() => setIssueLabels(projectId, row.issueId, before.labelIds, reviewerId));
    await db
      .update(issueDocket)
      .set({
        reviewStatus: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        reviewMoved: null,
      })
      .where(eq(issueDocket.id, docketId));
    throw error;
  }
}
