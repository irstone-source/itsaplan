import { request } from '@/lib/api/core/client';
import type { StateType } from '@/lib/api/endpoints/columns';

export type TodayBucket = 'overdue' | 'due' | 'started' | 'cycle' | 'scheduled';

export interface TodayIssue {
  id: number;
  sequenceNumber: number;
  title: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  stateType: StateType;
  columnName: string;
  columnColor: string;
  inCurrentCycle: boolean;
  projectId: number;
  projectKey: string;
  projectRef: string;
  projectName: string;
  bucket: TodayBucket;
}

export const getToday = (date: string, signal?: AbortSignal) =>
  request<{ date: string; items: TodayIssue[] }>(`/today?date=${date}`, { signal });
