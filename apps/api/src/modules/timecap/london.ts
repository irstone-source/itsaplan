import { HttpError } from '#shared/lib';

// Day and week boundaries of time capture are Europe/London, the team's zone,
// whatever zone the person's browser or device reports.
const ZONE = 'Europe/London';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function londonParts(at: Date) {
  const parts: Record<string, number> = {};
  for (const p of formatter.formatToParts(at))
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

// The London calendar day an instant falls on, as 'YYYY-MM-DD'.
export function londonDate(at: Date): string {
  const p = londonParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// London's offset from UTC at an instant, in milliseconds.
function londonOffsetMs(at: Date): number {
  const p = londonParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

function dayUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const utc = Date.UTC(y!, m! - 1, d!);
  if (new Date(utc).toISOString().slice(0, 10) !== day)
    throw new HttpError(400, 'date must be a valid YYYY-MM-DD');
  return utc;
}

// The instant of 00:00 of a London day. The offset is read at the UTC guess and
// once more at the result, in case the two fall on different sides of a clock change.
export function londonMidnight(day: string): Date {
  const guess = dayUtc(day);
  let at = guess - londonOffsetMs(new Date(guess));
  const offset = londonOffsetMs(new Date(at));
  if (guess - offset !== at) at = guess - offset;
  return new Date(at);
}

// [start, end) of a London day.
export function londonDayRange(day: string): [Date, Date] {
  const next = new Date(dayUtc(day) + 86_400_000).toISOString().slice(0, 10);
  return [londonMidnight(day), londonMidnight(next)];
}

// Monday 00:00 London of the week an instant falls in.
export function londonWeekStart(at: Date): Date {
  const today = londonDate(at);
  const utc = dayUtc(today);
  const sinceMonday = (new Date(utc).getUTCDay() + 6) % 7;
  const monday = new Date(utc - sinceMonday * 86_400_000).toISOString().slice(0, 10);
  return londonMidnight(monday);
}
