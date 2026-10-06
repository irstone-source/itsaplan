'use client';

import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import type { TrackerColour, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { COLOUR_CLASS, formatValue } from '../utils/format';

const RULE: Record<TrackerColour, string> = {
  green: 'before:bg-[#16a974]',
  amber: 'before:bg-[#f0ac1f]',
  red: 'before:bg-[#e5484d]',
  black: 'before:bg-foreground',
  grey: 'before:bg-border',
  open: 'before:bg-border',
};

// One North Star: its latest figure against target, its standing, and its recent
// periods in the board's own cell colours.
export default function TrackerNorthStarTile({ measure: m }: { measure: TrackerMeasure }) {
  const t = useTranslations('tracker');
  const latest = m.cells.findLast((c) => c.closed) ?? m.cells.at(-1);
  const recent = m.cells.slice(-8);
  const shown =
    m.unit === 'done'
      ? latest?.done == null
        ? '—'
        : t(latest.done ? 'yes' : 'no')
      : formatValue(m.unit, latest?.actual ?? null);
  const colour = latest?.colour ?? 'open';

  return (
    <a
      href={`#measure-${m.id}`}
      className={`relative flex flex-col gap-3 rounded-lg bg-muted/40 p-4 pt-5 transition-colors before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-lg hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${RULE[colour]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">
            {m.initiativeTitle ?? m.company}
          </div>
          <div className="truncate font-medium">{m.name}</div>
        </div>
        <Star className="size-4 shrink-0 fill-primary text-primary" aria-label={t('northStar')} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{shown}</span>
        {latest?.target != null && m.unit !== 'done' && (
          <span className="text-sm text-muted-foreground">
            {t('ofTarget', { target: formatValue(m.unit, latest.target) })}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1" aria-hidden>
          {recent.map((c) => (
            <span
              key={c.periodStart}
              className={`size-2.5 rounded-[2px] ${COLOUR_CLASS[c.colour]}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {latest?.closed ? t(`colour.${colour}`) : t('colour.open')}
        </span>
      </div>
    </a>
  );
}
