import { request } from '@/lib/api/core/client';

// A record of an agent's run on an issue. A draft reaches the issue as a comment only
// when a person attaches it.
export interface Docket {
  id: number;
  issueId: number;
  agentRunId: number | null;
  status: 'draft' | 'attached' | 'discarded';
  body: string;
  createdAt: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
}

export const listIssueDockets = (issueId: number) =>
  request<Docket[]>(`/issues/${issueId}/dockets`);

export const attachDocket = (docketId: number) =>
  request<Docket>(`/dockets/${docketId}/attach`, { method: 'POST' });

export const discardDocket = (docketId: number) =>
  request<Docket>(`/dockets/${docketId}/discard`, { method: 'POST' });
