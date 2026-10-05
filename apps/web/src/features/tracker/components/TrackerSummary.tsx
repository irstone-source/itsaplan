'use client';

import { useTranslations } from 'next-intl';
import type { TrackerColour, TrackerCounts } from '@/lib/api/endpoints/tracker';
import { COLOUR_CLASS } from '../utils/format';

const SHOWN: TrackerColour[] = ['green', 'amber', 'red', 'black'];

// Each loop's measures by the colour of their latest closed period.
export default function TrackerSummary({ summary }: { summary: Record<string, TrackerCounts> }) {
  const t = useTranslations('tracker');
  const loops = Object.keys(summary);
  if (loops.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {loops.map((loop) => {
        const c = summary[loop]!;
        const total = SHOWN.reduce((sum, k) => sum + c[k], 0);
        return (
          <div key={loop} className="space-y-2 rounded-lg border p-4">
            <div className="text-sm font-medium">{loop}</div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {SHOWN.map((k) =>
                c[k] ? (
                  <span
                    key={k}
                    className={COLOUR_CLASS[k]}
                    style={{ width: `${(c[k] / total) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {SHOWN.map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={`inline-block size-2 rounded-sm ${COLOUR_CLASS[k]}`} />
                  {t(`colour.${k}`)} {c[k]}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
