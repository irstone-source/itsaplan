import { request } from '@/lib/api/core/client';

export type TrackerColour = 'green' | 'amber' | 'red' | 'black' | 'grey' | 'open';
export type TrackerKind = 'activity' | 'engagement' | 'outcome' | 'guardrail' | 'gate';
export type TrackerUnit = 'count' | 'money' | 'percent' | 'done';
export type TrackerCadence = 'week' | 'month';
export type TrackerSource = 'manual' | 'billings' | 'tickets_completed';

// Money values are in pence.
export type TargetRule =
  | { type: 'fixed'; value: number }
  | { type: 'linear'; start: number; step: number }
  | { type: 'compounding'; start: number; ratePercent: number }
  | { type: 'gate'; start: number; target: number; by: string }
  | { type: 'shelf'; value: number }
  | { type: 'leapfrog'; start: number; steps: { from: string; value: number }[] }
  | { type: 'finance' }
  | { type: 'unset' };

export interface TrackerCell {
  periodStart: string;
  target: number | null;
  actual: number | null;
  done: boolean | null;
  colour: TrackerColour;
  streak: number;
  focus: boolean;
  rolling: { actual: number; target: number } | null;
  verified: boolean;
  restated: boolean;
  note: string;
  evidence: string;
  closed: boolean;
}

export interface TrackerMeasure {
  id: number;
  projectId: number;
  projectKey: string;
  initiativeId: number | null;
  initiativeTitle: string | null;
  company: string;
  loop: string;
  name: string;
  definition: string;
  kind: TrackerKind;
  unit: TrackerUnit;
  direction: 'at_least' | 'at_most';
  cadence: TrackerCadence;
  unlockPeriods: number;
  source: TrackerSource;
  ownerUserId: string | null;
  ownerName: string | null;
  startsOn: string;
  rule: TargetRule;
  targetHistory: { effectiveFrom: string; rule: TargetRule; reason: string; createdAt: string }[];
  canEnter: boolean;
  canEdit: boolean;
  cells: TrackerCell[];
}

export type TrackerCounts = Record<TrackerColour, number>;

export interface TrackerBoard {
  pulse: ({ periodStart: string } & TrackerCounts)[];
  settings: {
    loops: string[];
    companies: string[];
    greenPercent: number;
    amberPercent: number;
    targetSetters: 'owner_only' | 'measure_owner';
    maxMeasuresPerInitiative: number;
    historyPeriods: number;
    closeAfterHours: number;
  };
  summary: Record<string, TrackerCounts>;
  measures: TrackerMeasure[];
}

export interface TrackerFilters {
  company?: string;
  loop?: string;
}

export interface MeasureInput {
  projectId: number;
  initiativeId: number | null;
  company: string;
  loop: string;
  name: string;
  definition: string;
  kind: TrackerKind;
  unit: TrackerUnit;
  direction: 'at_least' | 'at_most';
  cadence: TrackerCadence;
  unlockPeriods: number;
  source: TrackerSource;
  ownerUserId: string | null;
  startsOn: string;
  rule: TargetRule;
  reason?: string;
}

export interface EntryInput {
  actual: number | null;
  done: boolean | null;
  note: string;
  verified: boolean;
  evidence: string;
}

export interface TrackerSettings {
  greenPercent: number;
  amberPercent: number;
  streaks: Record<TrackerKind, number>;
  smallNumberBelow: number;
  rollingPeriods: number;
  closeAfterHours: number;
  historyPeriods: number;
  maxMeasuresPerInitiative: number;
  loops: string[];
  companies: string[];
  targetSetters: 'owner_only' | 'measure_owner';
  escalateAfterDays: number;
}

export const getTrackerBoard = (f: TrackerFilters) => {
  const q = new URLSearchParams();
  if (f.company) q.set('company', f.company);
  if (f.loop) q.set('loop', f.loop);
  const qs = q.toString();
  return request<TrackerBoard>(`/tracker${qs ? `?${qs}` : ''}`);
};

export const createMeasure = (body: MeasureInput) =>
  request<{ id: number }>('/tracker/measures', { method: 'POST', body: JSON.stringify(body) });

export const updateMeasure = (id: number, body: Partial<MeasureInput>) =>
  request<{ id: number }>(`/tracker/measures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const archiveMeasure = (id: number) =>
  request<void>(`/tracker/measures/${id}`, { method: 'DELETE' });

export const setEntry = (id: number, periodStart: string, body: EntryInput) =>
  request<void>(`/tracker/measures/${id}/entries/${periodStart}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export interface ImportResult {
  created: { id: number; name: string; company: string }[];
  skipped: { name: string; company: string; reason: string }[];
}

export const loadStarterMeasures = () =>
  request<ImportResult>('/god/tracker/starter', { method: 'POST' });

export const getTrackerSettings = () => request<TrackerSettings>('/god/tracker');

export const updateTrackerSettings = (body: TrackerSettings) =>
  request<TrackerSettings>('/god/tracker', { method: 'PUT', body: JSON.stringify(body) });
