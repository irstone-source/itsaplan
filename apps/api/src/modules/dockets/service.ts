import { agentRun, aiAgent, db, initiative, issue, issueDocket, project, user } from '@repo/db';
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, gte, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { HttpError, instantParam, iso } from '#shared/lib';
import { getIssueProjectId } from '#modules/issues/service';
import { createComment } from '#modules/issues/activity';
import { londonDate, londonMidnight } from '#modules/timecap/london';
import { flagBlocked } from './review';
import {
  docketComment,
  fingerprintOf,
  FINGERPRINT_VERSION,
  hashAttachments,
  nextDocketNumber,
  sanitiseBody,
} from './stamp';

type DocketRow = typeof issueDocket.$inferSelect;

export interface DocketDto {
  id: number;
  number: string | null;
  kind: 'session' | 'agent';
  status: 'draft' | 'attached' | 'discarded';
  outcome: 'complete' | 'blocked' | null;
  evidence: string | null;
  body: string;
  issue: { id: number; identifier: string; title: string; projectKey: string };
  client: { id: number; name: string } | null;
  author: { id: string; name: string } | null;
  device: string | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  activeSeconds: number | null;
  attachments: Array<{
    publicId: string;
    filename: string;
    contentType: string;
    bytes: number;
    sha256: string;
    url: string;
  }>;
  fingerprint: string | null;
  stampedAt: string | null;
  reviewStatus: 'pending' | 'approved' | 'returned' | null;
  reviewer: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  moved: boolean | null;
  createdAt: string;
  canReview: boolean;
}

// What the caller may do with the project's dockets.
export interface DocketAccess {
  userId: string;
  canEdit: boolean;
  mayReview: boolean;
}

const author = alias(user, 'docket_author');
const reviewer = alias(user, 'docket_reviewer');

function selectDockets(where: SQL | undefined) {
  return db
    .select({
      docket: issueDocket,
      title: issue.title,
      seq: issue.sequenceNumber,
      projectKey: project.key,
      clientId: initiative.id,
      clientName: initiative.title,
      authorName: author.name,
      reviewerName: reviewer.name,
    })
    .from(issueDocket)
    .innerJoin(issue, eq(issue.id, issueDocket.issueId))
    .innerJoin(project, eq(project.id, issue.projectId))
    .leftJoin(initiative, eq(initiative.id, issue.initiativeId))
    .leftJoin(author, eq(author.id, issueDocket.authorUserId))
    .leftJoin(reviewer, eq(reviewer.id, issueDocket.reviewedBy))
    .where(where);
}

type Selected = Awaited<ReturnType<typeof selectDockets>>[number];

const isoOrNull = (value: Date | null) => (value ? iso(value) : null);

// `light` leaves out the body and the attachments, for the register.
function toDto(r: Selected, access: DocketAccess, light = false): DocketDto {
  const d = r.docket;
  return {
    id: d.id,
    number: d.number,
    kind: d.kind as DocketDto['kind'],
    status: d.status as DocketDto['status'],
    outcome: d.outcome as DocketDto['outcome'],
    evidence: d.evidence,
    body: light ? '' : d.body,
    issue: {
      id: d.issueId,
      identifier: `${r.projectKey}-${r.seq}`,
      title: r.title,
      projectKey: r.projectKey,
    },
    client: r.clientId != null ? { id: r.clientId, name: r.clientName ?? '' } : null,
    author: d.authorUserId ? { id: d.authorUserId, name: r.authorName ?? '' } : null,
    device: d.device,
    sessionStartedAt: isoOrNull(d.sessionStartedAt),
    sessionEndedAt: isoOrNull(d.sessionEndedAt),
    activeSeconds: d.activeSeconds,
    attachments: light
      ? []
      : d.attachments.map((a) => ({ ...a, url: `/attachments/${a.publicId}/raw` })),
    fingerprint: d.fingerprint,
    stampedAt: isoOrNull(d.stampedAt),
    reviewStatus: d.reviewStatus as DocketDto['reviewStatus'],
    reviewer: d.reviewedBy ? { id: d.reviewedBy, name: r.reviewerName ?? '' } : null,
    reviewedAt: isoOrNull(d.reviewedAt),
    reviewNote: d.reviewNote,
    moved: d.reviewStatus === 'approved' || d.reviewStatus === 'returned' ? d.reviewMoved : null,
    createdAt: iso(d.createdAt),
    canReview: access.mayReview && d.reviewStatus === 'pending' && d.authorUserId !== access.userId,
  };
}

export async function docketProjectId(docketId: number): Promise<number | null> {
  const [row] = await db
    .select({ issueId: issueDocket.issueId })
    .from(issueDocket)
    .where(eq(issueDocket.id, docketId));
  return row ? getIssueProjectId(row.issueId) : null;
}

// A draft or a discarded docket holds agent output nobody approved: only editors see it.
const stampedOnly = isNotNull(issueDocket.stampedAt);

export async function getDocket(docketId: number, access: DocketAccess): Promise<DocketDto> {
  const [row] = await selectDockets(eq(issueDocket.id, docketId));
  if (!row) throw new HttpError(404, 'Docket not found');
  if (!row.docket.stampedAt && !access.canEdit) {
    throw new HttpError(403, 'Only an editor of the issue sees an unattached docket');
  }
  return toDto(row, access);
}

export async function listDockets(issueId: number, access: DocketAccess): Promise<DocketDto[]> {
  const rows = await selectDockets(
    and(eq(issueDocket.issueId, issueId), access.canEdit ? undefined : stampedOnly),
  ).orderBy(desc(issueDocket.id));
  return rows.map((r) => toDto(r, access));
}

export interface RegisterFilters {
  month?: string;
  initiativeId?: number;
  outcome?: 'complete' | 'blocked';
  review?: 'pending' | 'approved' | 'returned';
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`;
}

// The stamped dockets of a project in one Europe/London month, newest first. The counts
// cover the month and the client filter, whatever the outcome and review filters are.
export async function listProjectDockets(
  projectId: number,
  filters: RegisterFilters,
  access: DocketAccess,
): Promise<{
  items: DocketDto[];
  counts: { approved: number; pending: number; blocked: number; returned: number };
}> {
  const month = filters.month ?? londonDate(new Date()).slice(0, 7);
  const scope = and(
    eq(issue.projectId, projectId),
    stampedOnly,
    gte(issueDocket.stampedAt, londonMidnight(`${month}-01`)),
    lt(issueDocket.stampedAt, londonMidnight(`${nextMonth(month)}-01`)),
    filters.initiativeId != null ? eq(issue.initiativeId, filters.initiativeId) : undefined,
  );
  const rows = await selectDockets(
    and(
      scope,
      filters.outcome ? eq(issueDocket.outcome, filters.outcome) : undefined,
      filters.review ? eq(issueDocket.reviewStatus, filters.review) : undefined,
    ),
  ).orderBy(desc(issueDocket.stampedAt), desc(issueDocket.id));
  const tally = (where: SQL) => sql<number>`(count(*) filter (where ${where}))::int`;
  const [counts] = await db
    .select({
      approved: tally(eq(issueDocket.reviewStatus, 'approved')),
      pending: tally(eq(issueDocket.reviewStatus, 'pending')),
      blocked: tally(eq(issueDocket.outcome, 'blocked')),
      returned: tally(eq(issueDocket.reviewStatus, 'returned')),
    })
    .from(issueDocket)
    .innerJoin(issue, eq(issue.id, issueDocket.issueId))
    .where(scope);
  return {
    items: rows.map((r) => toDto(r, access, true)),
    counts: counts ?? { approved: 0, pending: 0, blocked: 0, returned: 0 },
  };
}

// The docket comment posted by an issue's comment id, which no one may edit or delete.
export async function isDocketComment(commentId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: issueDocket.id })
    .from(issueDocket)
    .where(eq(issueDocket.commentId, commentId));
  return row != null;
}

async function linkComment(row: DocketRow, actorUserId: string): Promise<DocketRow> {
  const comment = await createComment({
    issueId: row.issueId,
    actorUserId,
    body: docketComment(row),
  });
  await db.update(issueDocket).set({ commentId: comment.id }).where(eq(issueDocket.id, row.id));
  return { ...row, commentId: comment.id };
}

// The steps after stamping, each done once: posting the comment, then for a blocked
// docket telling the people it concerns. A repeat finishes what an earlier try left.
async function finishDocket(row: DocketRow, actorUserId: string): Promise<void> {
  const posted = row.commentId == null ? await linkComment(row, actorUserId) : row;
  if (posted.outcome === 'blocked' && !posted.flaggedAt) {
    await flagBlocked((await getIssueProjectId(posted.issueId))!, {
      issueId: posted.issueId,
      id: posted.commentId!,
      actorUserId: posted.authorUserId,
    });
    await db
      .update(issueDocket)
      .set({ flaggedAt: new Date() })
      .where(eq(issueDocket.id, posted.id));
  }
}

export interface SessionDocketInput {
  clientKey: string;
  outcome: 'complete' | 'blocked';
  evidence: string;
  body: string;
  device: string;
  sessionStartedAt: string;
  sessionEndedAt: string;
  activeSeconds: number;
  attachmentIds: string[];
}

const CLOCK_SKEW_MS = 2 * 60_000;
const OLDEST_SESSION_MS = 30 * 86_400_000;

function sessionTimes(input: SessionDocketInput): { startedAt: Date; endedAt: Date } {
  const startedAt = instantParam('sessionStartedAt', input.sessionStartedAt);
  const endedAt = instantParam('sessionEndedAt', input.sessionEndedAt);
  if (!startedAt || !endedAt || endedAt < startedAt) {
    throw new HttpError(400, 'sessionEndedAt must be a time at or after sessionStartedAt');
  }
  const now = Date.now();
  if (endedAt.getTime() > now + CLOCK_SKEW_MS) {
    throw new HttpError(400, 'sessionEndedAt is in the future');
  }
  if (startedAt.getTime() < now - OLDEST_SESSION_MS) {
    throw new HttpError(400, 'sessionStartedAt is more than 30 days ago');
  }
  // Whole seconds: allow the rounding of one second.
  if ((input.activeSeconds - 1) * 1000 > endedAt.getTime() - startedAt.getTime()) {
    throw new HttpError(400, 'activeSeconds is longer than the session');
  }
  return { startedAt, endedAt };
}

async function byClientKey(issueId: number, clientKey: string): Promise<DocketRow | null> {
  const [row] = await db
    .select()
    .from(issueDocket)
    .where(and(eq(issueDocket.issueId, issueId), eq(issueDocket.clientKey, clientKey)));
  return row ?? null;
}

function sameAuthor(row: DocketRow, userId: string): DocketRow {
  if (row.authorUserId !== userId) {
    throw new HttpError(409, 'Another person already sent a docket with this clientKey');
  }
  return row;
}

// The time agent's docket of a work session, stamped as it is created. A repeat by the same
// person with the same clientKey returns the same docket and only finishes what an earlier
// try left undone.
export async function createSessionDocket(
  issueId: number,
  userId: string,
  input: SessionDocketInput,
): Promise<{ id: number; created: boolean }> {
  const existing = await byClientKey(issueId, input.clientKey);
  if (existing) {
    await finishDocket(sameAuthor(existing, userId), userId);
    return { id: existing.id, created: false };
  }
  const { startedAt, endedAt } = sessionTimes(input);
  if (!input.evidence.trim()) throw new HttpError(400, 'evidence must not be blank');
  const attachments = await hashAttachments(issueId, input.attachmentIds);
  const result = await db.transaction(async (tx) => {
    const number = await nextDocketNumber(tx, issueId);
    const [again] = await tx
      .select()
      .from(issueDocket)
      .where(and(eq(issueDocket.issueId, issueId), eq(issueDocket.clientKey, input.clientKey)));
    if (again) return { row: sameAuthor(again, userId), created: false };
    const values = {
      issueId,
      kind: 'session',
      status: 'attached',
      number,
      clientKey: input.clientKey,
      outcome: input.outcome,
      evidence: input.evidence,
      body: sanitiseBody(input.body),
      authorUserId: userId,
      device: input.device,
      sessionStartedAt: startedAt,
      sessionEndedAt: endedAt,
      activeSeconds: input.activeSeconds,
      attachments,
      stampedAt: new Date(),
      reviewStatus: input.outcome === 'complete' ? 'pending' : null,
      decidedBy: userId,
    };
    const [row] = await tx
      .insert(issueDocket)
      .values({
        ...values,
        decidedAt: values.stampedAt,
        fingerprint: fingerprintOf(values),
        fingerprintVersion: FINGERPRINT_VERSION,
      })
      .returning();
    return { row: row!, created: true };
  });
  if (result.created) await finishDocket(result.row, userId);
  return { id: result.row.id, created: result.created };
}

// Stamps an agent run's draft and adds it to the issue as the person's comment. Only a
// draft is decided, once: the conditional update lets one of two concurrent decisions
// through. A comment that could not be posted puts the draft back.
export async function attachDocket(docketId: number, userId: string): Promise<void> {
  const row = await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(issueDocket).where(eq(issueDocket.id, docketId));
    if (!draft || draft.status !== 'draft') return null;
    const number = await nextDocketNumber(tx, draft.issueId);
    const [run] = draft.agentRunId
      ? await tx
          .select({
            userId: aiAgent.userId,
            startedAt: agentRun.startedAt,
            finishedAt: agentRun.finishedAt,
          })
          .from(agentRun)
          .innerJoin(aiAgent, eq(aiAgent.id, agentRun.agentId))
          .where(eq(agentRun.id, draft.agentRunId))
      : [];
    const now = new Date();
    const stamp = {
      body: sanitiseBody(draft.body),
      number,
      outcome: 'complete',
      authorUserId: run?.userId ?? null,
      sessionStartedAt: run?.startedAt ?? null,
      sessionEndedAt: run?.finishedAt ?? null,
      stampedAt: now,
    };
    const [attached] = await tx
      .update(issueDocket)
      .set({
        ...stamp,
        status: 'attached',
        decidedBy: userId,
        decidedAt: now,
        reviewStatus: 'pending',
        fingerprint: fingerprintOf({ ...draft, ...stamp }),
        fingerprintVersion: FINGERPRINT_VERSION,
      })
      .where(and(eq(issueDocket.id, docketId), eq(issueDocket.status, 'draft')))
      .returning();
    return attached ?? null;
  });
  if (!row) throw new HttpError(409, 'This docket has already been decided');
  let posted: DocketRow;
  try {
    posted = await linkComment(row, userId);
  } catch (error) {
    await db
      .update(issueDocket)
      .set({
        status: 'draft',
        decidedBy: null,
        decidedAt: null,
        number: null,
        outcome: null,
        authorUserId: null,
        sessionStartedAt: null,
        sessionEndedAt: null,
        stampedAt: null,
        fingerprint: null,
        fingerprintVersion: null,
        reviewStatus: null,
      })
      .where(and(eq(issueDocket.id, docketId), isNull(issueDocket.commentId)));
    throw error;
  }
  await finishDocket(posted, userId);
}

export async function discardDocket(docketId: number, userId: string): Promise<void> {
  const [row] = await db
    .update(issueDocket)
    .set({ status: 'discarded', decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(issueDocket.id, docketId), eq(issueDocket.status, 'draft')))
    .returning({ id: issueDocket.id });
  if (!row) throw new HttpError(409, 'This docket has already been decided');
}
