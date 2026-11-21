import { request } from '@/lib/api/core/client';

export type DocketOutcome = 'complete' | 'blocked';
export type DocketReviewStatus = 'pending' | 'approved' | 'returned';

export interface DocketAttachment {
  publicId: string;
  filename: string;
  contentType: string;
  bytes: number;
  sha256: string;
  url: string;
}

// A record of work on an issue. A session docket comes from a person's time capture and
// is stamped when it is sent. An agent docket is a draft until a person attaches it, and
// is stamped then. The stamp fixes the number, the server time and the fingerprint.
export interface Docket {
  id: number;
  number: string | null;
  kind: 'session' | 'agent';
  status: 'draft' | 'attached' | 'discarded';
  outcome: DocketOutcome | null;
  evidence: string | null;
  body: string;
  issue: { id: number; identifier: string; title: string; projectKey: string };
  client: { id: number; name: string } | null;
  author: { id: string; name: string } | null;
  device: string | null;
  sessionStartedAt: string | null;
  sessionEndedAt: string | null;
  activeSeconds: number | null;
  attachments: DocketAttachment[];
  fingerprint: string | null;
  stampedAt: string | null;
  reviewStatus: DocketReviewStatus | null;
  reviewer: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  // False when an approval could not move the issue to a completed column.
  moved: boolean | null;
  canReview: boolean;
}

export interface DocketVerification {
  status: 'verified' | 'changed';
  checkedAt: string;
  problems: string[];
}

export interface DocketRegisterParams {
  month: string;
  initiativeId?: number;
  outcome?: DocketOutcome;
  review?: DocketReviewStatus;
}

export interface DocketRegister {
  items: Docket[];
  counts: { approved: number; pending: number; blocked: number; returned: number };
}

export const getDocket = (docketId: number) => request<Docket>(`/dockets/${docketId}`);

export const verifyDocket = (docketId: number) =>
  request<DocketVerification>(`/dockets/${docketId}/verify`);

export const listIssueDockets = (issueId: number) =>
  request<Docket[]>(`/issues/${issueId}/dockets`);

export const listProjectDockets = (projectKey: string, params: DocketRegisterParams) => {
  const q = new URLSearchParams({ month: params.month });
  if (params.initiativeId) q.set('initiativeId', String(params.initiativeId));
  if (params.outcome) q.set('outcome', params.outcome);
  if (params.review) q.set('review', params.review);
  return request<DocketRegister>(`/projects/${projectKey}/dockets?${q.toString()}`);
};

export const attachDocket = (docketId: number) =>
  request<Docket>(`/dockets/${docketId}/attach`, { method: 'POST' });

export const discardDocket = (docketId: number) =>
  request<Docket>(`/dockets/${docketId}/discard`, { method: 'POST' });

export const reviewDocket = (
  docketId: number,
  input: { decision: 'approve' | 'return'; note?: string },
) =>
  request<Docket>(`/dockets/${docketId}/review`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
