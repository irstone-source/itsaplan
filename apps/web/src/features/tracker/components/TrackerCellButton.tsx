'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import type { TrackerCell, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLOUR_CLASS, formatValue, periodLabel } from '../utils/format';
import TrackerEntryForm from './TrackerEntryForm';

// One period of a measure: its colour, a person marker while the figure is
// unverified, and its figures and the entry form on click.
export default function TrackerCellButton({
  measure: m,
  cell: c,
}: {
  measure: TrackerMeasure;
  cell: TrackerCell;
}) {
  const t = useTranslations('tracker');
  const [open, setOpen] = useState(false);
  const shown =
    m.unit === 'done'
      ? c.done == null
        ? '—'
        : t(c.done ? 'yes' : 'no')
      : formatValue(m.unit, c.actual);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${periodLabel(c.periodStart, m.cadence)}: ${t(`colour.${c.colour}`)}`}
          className={`relative inline-block size-6 rounded ${COLOUR_CLASS[c.colour]}`}
        >
          {!c.verified && (
            <UserRound className="absolute -end-1.5 -top-1.5 size-3.5 rounded-full bg-background p-px text-foreground" />
          )}
          {c.restated && (
            <span className="absolute start-0.5 bottom-0.5 size-1.5 rounded-full bg-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 text-sm">
        <div className="font-medium">
          {m.name} · {periodLabel(c.periodStart, m.cadence)}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{t('target')}</dt>
          <dd className="text-end tabular-nums">{formatValue(m.unit, c.target)}</dd>
          <dt className="text-muted-foreground">{t('actual')}</dt>
          <dd className="text-end tabular-nums">{shown}</dd>
          {c.rolling && (
            <>
              <dt className="text-muted-foreground">{t('rolling')}</dt>
              <dd className="text-end tabular-nums">
                {formatValue(m.unit, c.rolling.actual)} / {formatValue(m.unit, c.rolling.target)}
              </dd>
            </>
          )}
          {c.streak > 0 && (
            <>
              <dt className="text-muted-foreground">{t('streak')}</dt>
              <dd className="text-end tabular-nums">{c.streak}</dd>
            </>
          )}
        </dl>
        {!c.verified && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t('unverified')}</p>
        )}
        {c.colour === 'black' && (
          <p className="text-xs text-red-600 dark:text-red-400">{t('missing')}</p>
        )}
        {c.restated && <p className="text-xs text-muted-foreground">{t('restated')}</p>}
        {c.evidence && (
          <p className="text-xs text-muted-foreground">
            {t('evidence')}: {c.evidence}
          </p>
        )}
        {c.note && <p className="text-xs">{c.note}</p>}
        {m.canEnter && c.colour !== 'grey' && (
          <TrackerEntryForm measure={m} cell={c} onDone={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}
