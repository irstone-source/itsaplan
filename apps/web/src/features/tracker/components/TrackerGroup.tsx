'use client';

import { useTranslations } from 'next-intl';
import type { TrackerBoard, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { periodLabel } from '../utils/format';
import TrackerRow from './TrackerRow';

// One company's measures, weekly and monthly ones in tables of their own so each
// column is one period.
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
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{company}</h2>
      {(['week', 'month'] as const).map((cadence) => {
        const rows = measures.filter((m) => m.cadence === cadence);
        if (rows.length === 0) return null;
        const periods = [...new Set(rows.flatMap((m) => m.cells.map((c) => c.periodStart)))].sort();
        return (
          <div key={cadence} className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 text-start font-normal">
                    {t(cadence === 'week' ? 'weekly' : 'monthly')}
                  </th>
                  <th className="px-2 py-2 text-end font-normal">{t('target')}</th>
                  {periods.map((p) => (
                    <th key={p} className="px-0.5 py-2 text-center font-normal whitespace-nowrap">
                      {periodLabel(p, cadence)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <TrackerRow key={m.id} measure={m} periods={periods} settings={settings} />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
