'use client';

import { useTranslations } from 'next-intl';
import type { TrackerBoard, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { COLOUR_CLASS, PULSE_ORDER, periodLabel, recentPeriods } from '../utils/format';
import TrackerRow from './TrackerRow';

// One company's measures, weekly and monthly in tables of their own so each column is
// one period. The columns cover the measures' history, and at least the last six
// periods so a new board still reads as a timeline. The heading carries the company's colours in its latest closed periods.
export default function TrackerGroup({
  company,
  measures,
  settings,
}: {
  company: string;
  measures: TrackerMeasure[];
  settings: TrackerBoard['settings'];
}) {
  const t = useTranslations('tracker');
  const latest = measures.flatMap((m) => {
    const c = m.cells.findLast((x) => x.closed);
    return c && c.colour !== 'grey' ? [c.colour] : [];
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-3" aria-label={company}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{company}</h2>
        {latest.length > 0 && (
          <div className="flex h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
            {PULSE_ORDER.map((k) => {
              const n = latest.filter((c) => c === k).length;
              return n ? (
                <span
                  key={k}
                  className={COLOUR_CLASS[k]}
                  style={{ width: `${(n / latest.length) * 100}%` }}
                />
              ) : null;
            })}
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          {t('measureCount', { count: measures.length })}
        </span>
      </div>
      {(['week', 'month'] as const).map((cadence) => {
        const rows = measures.filter((m) => m.cadence === cadence);
        if (rows.length === 0) return null;
        const periods = [
          ...new Set([
            ...recentPeriods(cadence, Math.min(6, settings.historyPeriods)),
            ...rows.flatMap((m) => m.cells.map((c) => c.periodStart)),
          ]),
        ].sort();
        const current = periods.findLast((p) => p <= today);
        return (
          <div key={cadence} className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="sticky start-0 z-10 bg-background px-4 py-2.5 text-start font-medium">
                    {t(cadence === 'week' ? 'weekly' : 'monthly')}
                  </th>
                  <th className="px-2 py-2.5 text-end font-medium">{t('target')}</th>
                  {periods.map((p) => (
                    <th
                      key={p}
                      className={`px-1 py-2.5 text-center font-medium whitespace-nowrap tabular-nums ${p === current ? 'bg-primary/10 text-foreground' : ''}`}
                    >
                      {periodLabel(p, cadence)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <TrackerRow
                    key={m.id}
                    measure={m}
                    periods={periods}
                    current={current}
                    settings={settings}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
