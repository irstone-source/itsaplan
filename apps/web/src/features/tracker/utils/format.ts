import type { TrackerColour, TrackerUnit } from '@/lib/api/endpoints/tracker';
import { formatPence } from '@/utils/money';

export function formatValue(unit: TrackerUnit, value: number | null): string {
  if (value == null) return '—';
  if (unit === 'money') return formatPence(value);
  if (unit === 'percent') return `${Math.round(value * 10) / 10}%`;
  return String(Math.round(value * 100) / 100);
}

// Money is typed in pounds and stored in pence.
export const toStored = (unit: TrackerUnit, typed: string) =>
  unit === 'money' ? Math.round(Number(typed) * 100) : Number(typed);
export const toTyped = (unit: TrackerUnit, value: number | null) =>
  value == null ? '' : String(unit === 'money' ? value / 100 : value);

export const COLOUR_CLASS: Record<TrackerColour, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  black: 'bg-neutral-950 ring-1 ring-neutral-500',
  grey: 'bg-muted',
  open: 'border border-dashed border-muted-foreground/40',
};

export const periodLabel = (periodStart: string, cadence: 'week' | 'month') =>
  new Date(`${periodStart}T00:00:00Z`).toLocaleDateString(undefined, {
    day: cadence === 'week' ? 'numeric' : undefined,
    month: 'short',
    timeZone: 'UTC',
  });
