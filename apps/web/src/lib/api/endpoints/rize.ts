import { request } from '@/lib/api/core/client';

export interface RizeStatus {
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  entries: number;
}

export const getRizeStatus = () => request<RizeStatus>('/god/rize');

export const setRizeKey = (apiKey: string) =>
  request<RizeStatus>('/god/rize', { method: 'PUT', body: JSON.stringify({ apiKey }) });

export const syncRize = () =>
  request<{ synced: number; matched: number }>('/god/rize/sync', { method: 'POST' });

// none: no limit set; flag: 60% of the limit tracked; stop: 70%, down tools.
export type TimeState = 'none' | 'ok' | 'flag' | 'stop';

export interface ClientTime {
  initiativeId: number;
  title: string;
  trackedMinutes: number;
  limitMinutes: number | null;
  state: TimeState;
}

export interface UnmatchedEntry {
  id: number;
  memberEmail: string | null;
  startedAt: string;
  minutes: number;
  title: string;
  clientName: string | null;
  projectName: string | null;
  taskName: string | null;
  initiativeId: number | null;
}

export interface TimeOverview {
  month: string;
  clients: ClientTime[];
  trackedMinutes: number;
  matchedMinutes: number;
  unmatched: UnmatchedEntry[];
  rizeClients: { name: string; initiativeId: number | null }[];
}

export const getTimeOverview = (projectKey: string, month: string) =>
  request<TimeOverview>(`/projects/${projectKey}/time?month=${month}`);

export const linkTimeEntry = (projectKey: string, entryId: number, issueId: number | null) =>
  request<void>(`/projects/${projectKey}/time/entries/${entryId}/link`, {
    method: 'POST',
    body: JSON.stringify({ issueId }),
  });

export const mapRizeClient = (
  projectKey: string,
  rizeClient: string,
  initiativeId: number | null,
) =>
  request<void>(`/projects/${projectKey}/time/clients`, {
    method: 'PUT',
    body: JSON.stringify({ rizeClient, initiativeId }),
  });
