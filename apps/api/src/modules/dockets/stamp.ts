import { createHash, createHmac } from 'node:crypto';
import {
  db,
  type DbExecutor,
  type DocketAttachment,
  issue,
  issueActivity,
  issueAttachment,
  issueDocket,
  project,
} from '@repo/db';
import { derivedKey } from '@repo/crypto';
import { getObject } from '@repo/storage';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { quiet } from './draft';

type DocketRow = typeof issueDocket.$inferSelect;

export const FINGERPRINT_VERSION = 1;

// HMAC-SHA256 over the canonical JSON below, keys in this order and attachments in stored
// order, under a key derived from APP_ENCRYPTION_KEY: someone who can write the database
// cannot forge a matching fingerprint. Changing APP_ENCRYPTION_KEY makes every earlier
// docket fail verification.
export function fingerprintOf(row: {
  number: string | null;
  issueId: number;
  kind: string;
  outcome: string | null;
  evidence: string | null;
  body: string;
  stampedAt: Date | null;
  authorUserId: string | null;
  device: string | null;
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  activeSeconds: number | null;
  attachments: DocketAttachment[];
}): string {
  const canonical = JSON.stringify({
    number: row.number,
    issueId: row.issueId,
    kind: row.kind,
    outcome: row.outcome,
    evidence: row.evidence,
    body: row.body,
    stampedAt: row.stampedAt ? iso(row.stampedAt) : null,
    authorUserId: row.authorUserId,
    device: row.device,
    sessionStartedAt: row.sessionStartedAt ? iso(row.sessionStartedAt) : null,
    sessionEndedAt: row.sessionEndedAt ? iso(row.sessionEndedAt) : null,
    activeSeconds: row.activeSeconds,
    attachments: row.attachments.map((a) => ({
      publicId: a.publicId,
      filename: a.filename,
      contentType: a.contentType,
      bytes: a.bytes,
      sha256: a.sha256,
    })),
  });
  return createHmac('sha256', derivedKey('itsaplan-docket-v1')).update(canonical).digest('hex');
}

function isMissingObject(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

// The sha256 of an object's bytes, or null when the store has no such object.
export async function hashObject(s3Key: string): Promise<string | null> {
  let body: ReadableStream;
  try {
    ({ body } = await getObject(s3Key));
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
  const hash = createHash('sha256');
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) hash.update(chunk);
  return hash.digest('hex');
}

function storeError(filename: string, error: unknown): HttpError {
  const reason = error instanceof Error ? error.message : String(error);
  return new HttpError(502, `Could not read attachment ${filename}: ${reason}`);
}

// The attachments in the order given, each hashed from its stored bytes, one at a time.
// Each one has to be on the issue.
export async function hashAttachments(
  issueId: number,
  publicIds: string[],
): Promise<DocketAttachment[]> {
  const ids = [...new Set(publicIds)];
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(issueAttachment)
    .where(and(eq(issueAttachment.issueId, issueId), inArray(issueAttachment.publicId, ids)));
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'Every attachment of a docket must be on its issue');
  }
  const byId = new Map(rows.map((r) => [r.publicId, r]));
  const out: DocketAttachment[] = [];
  for (const id of ids) {
    const row = byId.get(id)!;
    const sha256 = await hashObject(row.s3Key).catch((error) => {
      throw storeError(row.filename, error);
    });
    if (!sha256) throw storeError(row.filename, new Error('the object store has no such file'));
    out.push({
      publicId: id,
      filename: row.filename,
      contentType: row.contentType,
      bytes: Number(row.sizeBytes),
      sha256,
    });
  }
  return out;
}

// Locks the issue so two stamps on it cannot take the same number, and returns the next one.
export async function nextDocketNumber(tx: DbExecutor, issueId: number): Promise<string> {
  const [row] = await tx
    .select({ key: project.key, seq: issue.sequenceNumber })
    .from(issue)
    .innerJoin(project, eq(project.id, issue.projectId))
    .where(eq(issue.id, issueId))
    .for('update', { of: issue });
  if (!row) throw new HttpError(404, 'Issue not found');
  const [stamped] = await tx
    .select({ n: count() })
    .from(issueDocket)
    .where(and(eq(issueDocket.issueId, issueId), isNotNull(issueDocket.number)));
  return `D-${row.key}-${row.seq}-${String((stamped?.n ?? 0) + 1).padStart(3, '0')}`;
}

const ATTACHMENT_IMAGE = /^\/media\/attachments\/[0-9a-f-]{36}\/raw$/i;

// A session body is markdown from the person's machine. Before it is stamped, an image is
// kept only when it is an attachment of this instance, raw HTML is escaped and no '@'
// mentions anyone, so the docket page and the comment load nothing from another host.
export function sanitiseBody(body: string): string {
  return body.replace(
    /\\[\s\S]|!\[([^\]\n]*)\]\(([^)\s]*)[^)\n]*\)|!\[|<|@(?!\u200b)/g,
    (match, alt: string | undefined, url: string | undefined) => {
      if (match.startsWith('\\')) return match;
      if (match === '<') return '\\<';
      if (match === '@') return '@\u200b';
      if (url !== undefined && ATTACHMENT_IMAGE.test(url))
        return `![${sanitiseBody(alt!)}](${url})`;
      if (alt !== undefined) return `\\!\\[${sanitiseBody(alt)}\\](${sanitiseBody(url!)})`;
      return '\\!\\[';
    },
  );
}

const london = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// "21 Nov 2026 14:03 UK (14:03 UTC)"
export function stampText(at: Date): string {
  const p = Object.fromEntries(london.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year} ${p.hour}:${p.minute} UK (${iso(at).slice(11, 16)} UTC)`;
}

// The number goes in a code span: as plain text the app would link the issue key inside it.
export function docketLabel(number: string | null): string {
  return `**Evidence docket \`${number}\`**`;
}

// The exact comment a stamped docket is posted as.
export function docketComment(row: DocketRow): string {
  const outcome = row.outcome === 'blocked' ? 'Blocked' : 'Complete — pending review';
  const header =
    `${docketLabel(row.number)} · stamped ${stampText(row.stampedAt!)} · ${outcome} · ` +
    `[Open docket](/docket/${row.id})`;
  return `${header}\n\n${quiet(row.body)}`;
}

export interface VerifyResult {
  status: 'verified' | 'changed';
  checkedAt: string;
  problems: string[];
}

const HASH_CACHE_MS = 5 * 60_000;
// Attachment problems per docket. The key holds each attachment's object key, which a
// replacement changes, so a cached answer never hides a replaced file.
const attachmentChecks = new Map<number, { key: string; at: number; problems: string[] }>();

async function attachmentProblems(row: DocketRow): Promise<string[]> {
  const ids = row.attachments.map((a) => a.publicId);
  const current = ids.length
    ? await db
        .select({ publicId: issueAttachment.publicId, s3Key: issueAttachment.s3Key })
        .from(issueAttachment)
        .where(inArray(issueAttachment.publicId, ids))
    : [];
  const keys = new Map(current.map((r) => [r.publicId, r.s3Key]));
  const cacheKey = ids.map((id) => `${id}:${keys.get(id) ?? ''}`).join('|');
  const cached = attachmentChecks.get(row.id);
  if (cached && cached.key === cacheKey && Date.now() - cached.at < HASH_CACHE_MS) {
    return cached.problems;
  }
  const problems: string[] = [];
  for (const a of row.attachments) {
    const key = keys.get(a.publicId);
    const sha256 = key
      ? await hashObject(key).catch((error) => {
          throw storeError(a.filename, error);
        })
      : null;
    if (!sha256) problems.push(`Attachment ${a.filename} (${a.publicId}) is missing`);
    else if (sha256 !== a.sha256) problems.push(`Attachment ${a.filename} (${a.publicId}) changed`);
  }
  attachmentChecks.set(row.id, { key: cacheKey, at: Date.now(), problems });
  return problems;
}

// Recomputes the fingerprint, compares the posted comment and re-reads every attachment's
// bytes. A store error other than a missing file is a 502: the docket could not be checked.
export async function verifyDocket(docketId: number): Promise<VerifyResult> {
  const [row] = await db.select().from(issueDocket).where(eq(issueDocket.id, docketId));
  if (!row) throw new HttpError(404, 'Docket not found');
  if (!row.stampedAt || !row.fingerprint) {
    throw new HttpError(409, 'Only a stamped docket can be verified');
  }
  const problems: string[] = [];
  if (fingerprintOf(row) !== row.fingerprint) {
    problems.push('The docket body or details changed since stamping');
  }
  const [comment] = row.commentId
    ? await db
        .select({ body: issueActivity.body, editedAt: issueActivity.editedAt })
        .from(issueActivity)
        .where(eq(issueActivity.id, row.commentId))
    : [];
  if (!comment || comment.editedAt || comment.body !== docketComment(row)) {
    problems.push('The posted comment was edited or deleted');
  }
  problems.push(...(await attachmentProblems(row)));
  return {
    status: problems.length ? 'changed' : 'verified',
    checkedAt: iso(new Date()),
    problems,
  };
}
