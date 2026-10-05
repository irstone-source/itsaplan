// The growth tracker's rules: period boundaries, targets from a rule, and the colour
// of each period. Pure functions over plain values; the service feeds them.

export type Cadence = 'week' | 'month';
export type Kind = 'activity' | 'engagement' | 'outcome' | 'guardrail' | 'gate';
export type Unit = 'count' | 'money' | 'percent' | 'done';
export type Direction = 'at_least' | 'at_most';
export type Colour = 'green' | 'amber' | 'red' | 'black' | 'grey' | 'open';

export type TargetRule =
  | { type: 'fixed'; value: number }
  | { type: 'linear'; start: number; step: number }
  | { type: 'compounding'; start: number; ratePercent: number }
  | { type: 'gate'; start: number; target: number; by: string }
  | { type: 'shelf'; value: number }
  | { type: 'leapfrog'; start: number; steps: { from: string; value: number }[] }
  | { type: 'finance' };

export interface TrackerSettings {
  greenPercent: number;
  amberPercent: number;
  streaks: Record<Kind, number>;
  // A target below this is also judged on the rolling total of `rollingPeriods`.
  smallNumberBelow: number;
  rollingPeriods: number;
  // Hours after a period ends before an empty period turns black.
  closeAfterHours: number;
  historyPeriods: number;
  maxMeasuresPerInitiative: number;
  loops: string[];
  companies: string[];
  // Who may set and change targets: the instance owner only, or the measure's owner too.
  targetSetters: 'owner_only' | 'measure_owner';
  // Working days a hole stays open before it is escalated to the instance owner.
  escalateAfterDays: number;
}

export const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  greenPercent: 90,
  amberPercent: 70,
  streaks: { activity: 2, engagement: 3, outcome: 4, guardrail: 1, gate: 1 },
  smallNumberBelow: 5,
  rollingPeriods: 4,
  closeAfterHours: 12,
  historyPeriods: 13,
  maxMeasuresPerInitiative: 5,
  loops: ['Rev loop', 'Cap loop'],
  companies: [],
  targetSetters: 'owner_only',
  escalateAfterDays: 3,
};

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

// The start of the period containing `date`: the Monday of its week, or the 1st.
export function periodStartOf(date: string, cadence: Cadence): string {
  const d = utc(date);
  if (cadence === 'month') return `${date.slice(0, 7)}-01`;
  const back = (d.getUTCDay() + 6) % 7;
  return ymd(new Date(d.getTime() - back * DAY));
}

export function nextPeriodStart(start: string, cadence: Cadence): string {
  const d = utc(start);
  if (cadence === 'week') return ymd(new Date(d.getTime() + 7 * DAY));
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

export function previousPeriodStart(start: string, cadence: Cadence): string {
  const d = utc(start);
  if (cadence === 'week') return ymd(new Date(d.getTime() - 7 * DAY));
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
}

// The last `count` period starts up to and including the one containing `today`,
// oldest first.
export function recentPeriods(today: string, cadence: Cadence, count: number): string[] {
  const out = [periodStartOf(today, cadence)];
  while (out.length < count) out.unshift(previousPeriodStart(out[0]!, cadence));
  return out;
}

// Periods from `from` to `to`, both period starts, `to` excluded.
export function periodsBetween(from: string, to: string, cadence: Cadence): number {
  let n = 0;
  for (let p = from; p < to; p = nextPeriodStart(p, cadence)) n++;
  return n;
}

export function isClosed(
  start: string,
  cadence: Cadence,
  now: Date,
  closeAfterHours: number,
): boolean {
  const end = utc(nextPeriodStart(start, cadence)).getTime();
  return now.getTime() >= end + closeAfterHours * 3_600_000;
}

// The target a rule sets for the period `index` periods after the measure started.
// `finance` targets come from the cycles and are passed in by the caller.
export function ruleTarget(
  rule: TargetRule,
  index: number,
  periodStart: string,
  cadence: Cadence,
  finance: number | null,
): number | null {
  switch (rule.type) {
    case 'fixed':
    case 'shelf':
      return rule.value;
    case 'linear':
      return rule.start + rule.step * index;
    case 'compounding':
      return rule.start * (1 + rule.ratePercent / 100) ** index;
    case 'gate': {
      const gatePeriod = periodStartOf(rule.by, cadence);
      if (periodStart >= gatePeriod) return rule.target;
      // The pace from the start value to the gate value, reached in the gate's period.
      const left = periodsBetween(periodStart, gatePeriod, cadence);
      const total = index + left;
      return rule.start + ((rule.target - rule.start) * index) / Math.max(1, total);
    }
    case 'leapfrog': {
      let value = rule.start;
      for (const step of [...rule.steps].sort((a, b) => a.from.localeCompare(b.from)))
        if (step.from <= periodStart) value = step.value;
      return value;
    }
    case 'finance':
      return finance;
  }
}

export interface PeriodInput {
  periodStart: string;
  closed: boolean;
  locked: boolean;
  target: number | null;
  actual: number | null;
  done: boolean | null;
  hasEntry: boolean;
}

export interface PeriodResult {
  colour: Colour;
  // Consecutive red or black periods ending here.
  streak: number;
  focus: boolean;
  // Set when the small-number rule judged the period on its rolling total.
  rolling: { actual: number; target: number } | null;
}

function band(
  actual: number,
  target: number,
  direction: Direction,
  kind: Kind,
  s: TrackerSettings,
): Colour {
  if (direction === 'at_most') {
    if (actual <= target) return 'green';
    if (kind === 'guardrail') return 'red';
    return actual <= target * (2 - s.amberPercent / 100) ? 'amber' : 'red';
  }
  if (target <= 0) return 'green';
  const ratio = actual / target;
  if (ratio >= s.greenPercent / 100) return 'green';
  if (ratio >= s.amberPercent / 100) return 'amber';
  return 'red';
}

// Colours a measure's periods, oldest first. An empty closed period is black and
// counts toward a streak like a red. A yes/no measure goes amber on its first miss and
// red on the second in a row.
export function colourPeriods(
  periods: PeriodInput[],
  measure: { kind: Kind; unit: Unit; direction: Direction },
  s: TrackerSettings,
): PeriodResult[] {
  const out: PeriodResult[] = [];
  periods.forEach((p, i) => {
    let colour: Colour;
    let rolling: PeriodResult['rolling'] = null;
    const prev = out[i - 1];
    if (p.locked) colour = 'grey';
    else if (!p.hasEntry) colour = p.closed ? 'black' : 'open';
    else if (measure.unit === 'done') {
      if (p.done) colour = 'green';
      else colour = prev && ['amber', 'red', 'black'].includes(prev.colour) ? 'red' : 'amber';
    } else if (p.target == null || p.actual == null) colour = 'grey';
    else if (
      measure.direction === 'at_least' &&
      p.target > 0 &&
      p.target < s.smallNumberBelow &&
      s.rollingPeriods > 1
    ) {
      const window = periods.slice(Math.max(0, i - s.rollingPeriods + 1), i + 1);
      rolling = {
        actual: window.reduce((sum, w) => sum + (w.actual ?? 0), 0),
        target: window.reduce((sum, w) => sum + (w.target ?? 0), 0),
      };
      colour = band(rolling.actual, rolling.target, measure.direction, measure.kind, s);
    } else colour = band(p.actual, p.target, measure.direction, measure.kind, s);

    const bad = colour === 'red' || colour === 'black';
    const streak = bad ? (prev?.streak ?? 0) + 1 : 0;
    out.push({ colour, streak, focus: streak >= s.streaks[measure.kind], rolling });
  });
  return out;
}

// Monday to Friday between two dates, both included.
export function workingDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let t = utc(from).getTime(); t <= utc(to).getTime(); t += DAY) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// The share of each cycle's value that falls in a period, by working days.
export function financeTarget(
  periodStart: string,
  periodEnd: string,
  cycles: { startDate: string; endDate: string; value: number }[],
): number | null {
  let total = 0;
  let any = false;
  const lastDay = ymd(new Date(utc(periodEnd).getTime() - DAY));
  for (const c of cycles) {
    const from = c.startDate > periodStart ? c.startDate : periodStart;
    const to = c.endDate < lastDay ? c.endDate : lastDay;
    if (from > to) continue;
    const days = workingDaysBetween(c.startDate, c.endDate);
    if (days === 0) continue;
    any = true;
    total += (c.value * workingDaysBetween(from, to)) / days;
  }
  return any ? Math.round(total) : null;
}
