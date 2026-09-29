import { request } from '@/lib/api/core/client';
import { pageQuery, type Page, type PageParams } from '@/lib/api/core/paging';

// A time-boxed period of work (a sprint). status follows from the dates against
// today, unless the cycle was finished ahead of them; progress follows from the
// linked issues' states.
export type CycleStatus = 'upcoming' | 'active' | 'completed';

// A cycle as a picker option, for planning an issue into one.
export interface CycleOption {
  id: number;
  name: string;
  status: CycleStatus;
}

export interface CycleProgress {
  completed: number;
  canceled: number;
  total: number;
}

export interface Cycle {
  id: number;
  projectId: number;
  name: string;
  // What the team commits to in this cycle (the sprint goal). Empty when unset.
  goal: string;
  startDate: string;
  endDate: string;
  // What the cycle's work should be worth (pence), for planning against.
  targetPence: number | null;
  // When the cycle was finished ahead of its planned end date, or null. endDate
  // keeps the date it was planned to run until either way.
  completedAt: string | null;
  status: CycleStatus;
  createdAt: string;
  updatedAt: string;
  progress: CycleProgress;
}

export interface NewCycleInput {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface CyclePatch {
  name?: string;
  goal?: string;
  targetPence?: number | null;
  startDate?: string;
  endDate?: string;
}

// Cycles — same shape as initiatives: the list takes projectKey, ops on one cycle
// take its own id and hit /cycles/:id.
export const listCycles = (projectKey: string) =>
  request<Cycle[]>(`/projects/${projectKey}/cycles`);

export const listPlannedCycles = (projectKey: string) =>
  request<Cycle[]>(`/projects/${projectKey}/cycles?status=planned`);

export const listCycleOptions = (projectKey: string) =>
  request<CycleOption[]>(`/projects/${projectKey}/cycles/options`);

export const listCompletedCycles = (projectKey: string, params: PageParams) =>
  request<Page<Cycle>>(`/projects/${projectKey}/cycles/completed${pageQuery(params)}`);

export const getCycle = (id: number) => request<Cycle>(`/cycles/${id}`);

export type BillableKind = 'billable' | 'internal';

// What the cycle's work is worth once done (all amounts in pence).
export interface CycleBillables {
  hoursPerDay: number;
  targetPence: number | null;
  internalDayRatePence: number | null;
  totals: {
    billablePence: number;
    billableDonePence: number;
    internalPence: number;
    internalDonePence: number;
    // Billable value less internal cost.
    netPence: number;
    estimatedMinutes: number;
    unestimated: number;
    unpriced: number;
  };
  groups: {
    initiativeId: number | null;
    title: string;
    kind: BillableKind;
    billingModel: string | null;
    dayRatePence: number | null;
    valuePence: number;
    donePence: number;
    issueCount: number;
  }[];
  issues: {
    id: number;
    identifier: string;
    title: string;
    stateType: string;
    initiativeId: number | null;
    estimateMinutes: number | null;
    valuePence: number | null;
    overridden: boolean;
    kind: BillableKind;
  }[];
}

export const getCycleBillables = (id: number) => request<CycleBillables>(`/cycles/${id}/billables`);

export const createCycle = (projectKey: string, input: NewCycleInput) =>
  request<Cycle>(`/projects/${projectKey}/cycles`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateCycle = (id: number, patch: CyclePatch) =>
  request<Cycle>(`/cycles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteCycle = (id: number) => request<void>(`/cycles/${id}`, { method: 'DELETE' });

export const transferCycleIssues = (id: number, targetCycleId: number | null) =>
  request<{ moved: number }>(`/cycles/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetCycleId }),
  });

export const finishCycle = (id: number) =>
  request<Cycle>(`/cycles/${id}/finish`, { method: 'POST' });

export const startNextCycle = (id: number) =>
  request<{ cycle: Cycle; moved: number }>(`/cycles/${id}/start-next`, { method: 'POST' });
