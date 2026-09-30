import { request } from '@/lib/api/core/client';

export interface FinanceMonth {
  month: string;
  cycle: {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    targetPence: number | null;
  } | null;
  breakEvenPence: number | null;
  poolPercent: number;
  billingsPence: number;
}

export interface Finance {
  startMonth: string;
  revenueTargetPence: number | null;
  projectId: number | null;
  projects: { id: number; key: string; name: string }[];
  months: FinanceMonth[];
}

export const getFinance = (start?: string) =>
  request<Finance>(`/god/finance${start ? `?start=${start}` : ''}`);

export const setFinanceYear = (
  start: string,
  body: { revenueTargetPence: number; projectId: number },
) => request<Finance>(`/god/finance/${start}`, { method: 'PUT', body: JSON.stringify(body) });
