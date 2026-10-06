import type { TrackerColour, TrackerUnit } from '@/lib/api/endpoints/tracker';
import { formatPence } from '@/utils/money';

export function formatValue(unit: TrackerUnit, value: number | null): string {
  if (value == null) return '—';
  if (unit === 'money') return formatPence(value);
  if (unit === 'percent') return `${Math.round(value * 10) / 10}%`;
  return String(Math.round(value * 100) / 100);
}

// The figure as it fits inside a cell: £1.2k, 3.4k, 2%.
export function formatCompact(unit: TrackerUnit, value: number | null): string {
  if (value == null) return '';
  const n = unit === 'money' ? value / 100 : value;
  if (unit === 'percent') return `${Math.round(n * 10) / 10}%`;
  const short =
    Math.abs(n) >= 1_000_000
      ? `${Math.round(n / 100_000) / 10}m`
      : Math.abs(n) >= 1000
        ? `${Math.round(n / 100) / 10}k`
        : String(Math.round(n * 10) / 10);
  return unit === 'money' ? `£${short}` : short;
}

// Money is typed in pounds and stored in pence.
export const toStored = (unit: TrackerUnit, typed: string) =>
  unit === 'money' ? Math.round(Number(typed) * 100) : Number(typed);
export const toTyped = (unit: TrackerUnit, value: number | null) =>
  value == null ? '' : String(unit === 'money' ? value / 100 : value);

export const COLOUR_CLASS: Record<TrackerColour, string> = {
  green: 'bg-[#16a974] text-white',
  amber: 'bg-[#f0ac1f] text-neutral-950',
  red: 'bg-[#e5484d] text-white',
  black: 'bg-black text-white ring-1 ring-inset ring-white/25',
  grey: 'bg-muted text-muted-foreground',
  open: 'border border-dashed border-muted-foreground/40 text-muted-foreground',
};

// Bottom to top in a pulse column: the good news carries the weight.
export const PULSE_ORDER: TrackerColour[] = ['green', 'amber', 'red', 'black'];

export const periodLabel = (periodStart: string, cadence: 'week' | 'month') =>
  new Date(`${periodStart}T00:00:00Z`).toLocaleDateString(undefined, {
    day: cadence === 'week' ? 'numeric' : undefined,
    month: 'short',
    timeZone: 'UTC',
  });

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// The last `count` period starts up to the one containing today, oldest first: the
// columns the board shows, whether or not a measure has a figure in them yet.
export function recentPeriods(cadence: 'week' | 'month', count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (cadence === 'month') {
      out.push(ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
    } else {
      const monday =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        ((now.getUTCDay() + 6) % 7) * DAY;
      out.push(ymd(new Date(monday - i * 7 * DAY)));
    }
  }
  return out;
}

// When the period starting at `periodStart` closes: its end plus the closing hours.
export function closesAt(periodStart: string, cadence: 'week' | 'month', closeAfterHours: number) {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end =
    cadence === 'week'
      ? new Date(start.getTime() + 7 * DAY)
      : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return new Date(end.getTime() + closeAfterHours * 3_600_000);
}
