import { request } from '@/lib/api/core/client';

// Mirrors apps/api/src/modules/timecap/model.ts by hand: the web never imports the API.

export interface TimeIssueRef {
  id: number;
  identifier: string;
  title: string;
  // The bare project key (`CON`), not the `<teamRef>.<key>` ref the project routes take.
  projectKey: string;
}

export interface TimeInitiativeRef {
  id: number;
  title: string;
}

export type TimeBlockStatus = 'pending' | 'confirmed' | 'ignored';

export interface TimeBlock {
  id: number;
  device: string;
  source: 'activity' | 'call' | 'manual';
  startedAt: string;
  endedAt: string;
  seconds: number;
  app: string;
  title: string;
  domain: string | null;
  // A call carries { direction: 'in' | 'out', contact: string | null, number: string }.
  detail: Record<string, unknown>;
  status: TimeBlockStatus;
  issue: TimeIssueRef | null;
  initiative: TimeInitiativeRef | null;
  suggestion: {
    issue: TimeIssueRef | null;
    initiative: TimeInitiativeRef | null;
    confidence: number;
    reason: string;
  } | null;
  // A block of a past week is read-only to its person.
  locked: boolean;
}

export interface TimeDevice {
  name: string;
  platform: string;
  agentVersion: string | null;
  trackerOk: boolean;
  lastSeenAt: string;
}

export interface MyTimeDay {
  date: string;
  blocks: TimeBlock[];
  totals: {
    capturedSeconds: number;
    confirmedSeconds: number;
    pendingSeconds: number;
    ignoredSeconds: number;
    // Pending blocks "Confirm suggested" would confirm (confidence >= 85).
    confidentPending: number;
  };
  devices: TimeDevice[];
}

export interface MyTimeStatus {
  // A device seen in the last 24 hours.
  active: boolean;
  devices: TimeDevice[];
}

export type TimeRuleField = 'app' | 'title' | 'domain' | 'contact';

export interface TimeRule {
  id: number;
  personal: boolean;
  field: string;
  pattern: string;
  issue: TimeIssueRef | null;
  initiative: TimeInitiativeRef | null;
  ignore: boolean;
  hits: number;
}

export interface AllocateInput {
  action: 'confirm' | 'ignore' | 'reset';
  // confirm: the ticket and/or initiative; omitted → the suggestion.
  issueId?: number | null;
  initiativeId?: number | null;
  // Also create a personal rule from this block.
  remember?: boolean;
}

export interface CaptureInput {
  projectKey: string;
  title: string;
  initiativeId?: number | null;
}

export interface NewTimeRule {
  field: TimeRuleField;
  pattern: string;
  issueId?: number | null;
  initiativeId?: number | null;
  ignore?: boolean;
}

export interface TeamTimeMember {
  userId: string;
  name: string;
  devices: TimeDevice[];
  confirmedSecondsThisWeek: number;
  pendingSecondsThisWeek: number;
}

export const getMyTime = (date: string, signal?: AbortSignal) =>
  request<MyTimeDay>(`/me/time?date=${date}`, { signal });

export const getMyTimeStatus = (signal?: AbortSignal) =>
  request<MyTimeStatus>('/me/time/status', { signal });

export const allocateTimeBlock = (blockId: number, input: AllocateInput) =>
  request<TimeBlock>(`/me/time/blocks/${blockId}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const splitTimeBlock = (blockId: number, at: string) =>
  request<TimeBlock[]>(`/me/time/blocks/${blockId}/split`, {
    method: 'POST',
    body: JSON.stringify({ at }),
  });

export const captureTimeBlock = (blockId: number, input: CaptureInput) =>
  request<TimeBlock>(`/me/time/blocks/${blockId}/capture`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const confirmMyDay = (date: string, minConfidence?: number) =>
  request<{ confirmed: number }>('/me/time/confirm-day', {
    method: 'POST',
    body: JSON.stringify({ date, minConfidence }),
  });

export const listTimeRules = (signal?: AbortSignal) =>
  request<TimeRule[]>('/me/time/rules', { signal });

export const createTimeRule = (input: NewTimeRule) =>
  request<TimeRule>('/me/time/rules', { method: 'POST', body: JSON.stringify(input) });

export const deleteTimeRule = (ruleId: number) =>
  request<void>(`/me/time/rules/${ruleId}`, { method: 'DELETE' });

export const getTeamTime = (projectKey: string, signal?: AbortSignal) =>
  request<TeamTimeMember[]>(`/projects/${projectKey}/time/team`, { signal });

export const promoteTimeRule = (projectKey: string, ruleId: number) =>
  request<TimeRule>(`/projects/${projectKey}/time/rules/${ruleId}/promote`, { method: 'POST' });
