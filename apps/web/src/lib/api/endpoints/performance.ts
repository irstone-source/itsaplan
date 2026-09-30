import { request } from '@/lib/api/core/client';

export interface PerformanceTicket {
  id: number;
  identifier: string;
  title: string;
  valuePence: number;
}

// What a member sees: their own figures, and the team's progress to break-even as a
// ratio only.
export interface MyPerformance {
  month: string;
  breakEvenSet: boolean;
  me: {
    billingsPence: number;
    shareOfBreakEven: number | null;
    bonusPence: number;
    tickets: PerformanceTicket[];
  };
  teamProgress: number | null;
}

export interface TeamPerformance {
  month: string;
  breakEvenPence: number | null;
  poolPercent: number;
  team: {
    billingsPence: number;
    aboveBreakEvenPence: number;
    poolPence: number;
    progress: number | null;
  };
  people: {
    userId: string;
    name: string;
    billingsPence: number;
    shareOfBreakEven: number | null;
    bonusPence: number;
    tickets: PerformanceTicket[];
  }[];
}

export const getMyPerformance = (month: string) =>
  request<MyPerformance>(`/performance/me?month=${month}`);

export const getTeamPerformance = (month: string) =>
  request<TeamPerformance>(`/god/performance?month=${month}`);

export const setPerformanceMonth = (
  month: string,
  body: { breakEvenPence: number; poolPercent: number },
) =>
  request<TeamPerformance>(`/god/performance/${month}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
