import { formatMinutes } from '@/utils/estimate';
import type { TimeIssueRef, TimeInitiativeRef } from '@/lib/api/endpoints/timecap';

// Blocks are reviewed by London calendar day, the day the week lock is counted in.
const londonDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const todayLondon = (now = new Date()) => londonDay.format(now);

// A calendar step, not 24 hours: on the night of a clock change those differ.
export const yesterdayLondon = (now = new Date()) => shiftDay(todayLondon(now), -1);

export const formatSeconds = (seconds: number) => formatMinutes(Math.round(seconds / 60));

// What a block or a rule points at: the ticket, else the initiative, else nothing.
export const targetLabel = (
  issue: TimeIssueRef | null,
  initiative: TimeInitiativeRef | null,
): string | null => issue?.identifier ?? initiative?.title ?? null;
