'use client';

import { useTranslations } from 'next-intl';
import type { TrackerBoard, TrackerColour } from '@/lib/api/endpoints/tracker';
import { COLOUR_CLASS, PULSE_ORDER, periodLabel } from '../utils/format';

// The board's heartbeat: one column per week, split by how many weekly measures stood
// at each colour, under a sentence on the last closed week.
export default function TrackerPulse({ board }: { board: TrackerBoard }) {
  const t = useTranslations('tracker.pulse');
  const tColour = useTranslations('tracker.colour');
  const weeks = board.pulse;
  const closedCells = board.measures.flatMap((m) => {
    const last = m.cells.findLast((c) => c.closed);
    return last ? [last] : [];
  });
  const judged = closedCells.filter((c) => c.colour !== 'grey');
  const green = judged.filter((c) => c.colour === 'green').length;
  const holes = board.measures.reduce(
    (n, m) => n + m.cells.filter((c) => c.colour === 'black').length,
    0,
  );
  const unverified = board.measures.reduce(
    (n, m) => n + m.cells.filter((c) => !c.verified && c.closed).length,
    0,
  );
  const focus = closedCells.filter((c) => c.focus).length;
  const max = Math.max(1, ...weeks.map((w) => PULSE_ORDER.reduce((s, k) => s + w[k], 0)));
  const lastClosed = weeks.findLast((w) => w.open === 0);

  return (
    <section
      aria-labelledby="tracker-pulse"
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-end"
    >
      <div className="space-y-3">
        <h2
          id="tracker-pulse"
          className="text-3xl leading-tight font-semibold tracking-tight text-balance"
        >
          {judged.length ? t('headline', { green, total: judged.length }) : t('headlineNone')}
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <span
            className={`rounded-md px-2 py-0.5 ${holes ? COLOUR_CLASS.black : 'bg-muted text-muted-foreground'}`}
          >
            {t('holes', { count: holes })}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
            {t('unverified', { count: unverified })}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 ${focus ? 'bg-[#e5484d]/12 text-[#c62a2f] dark:text-[#ff8589]' : 'bg-muted text-muted-foreground'}`}
          >
            {t('focus', { count: focus })}
          </span>
        </div>
      </div>
      {weeks.length > 0 && (
        <figure className="space-y-2">
          <div className="flex h-28 items-end gap-1.5" aria-hidden>
            {weeks.map((w) => {
              const total = PULSE_ORDER.reduce((s, k) => s + w[k], 0);
              const isLast = w.periodStart === lastClosed?.periodStart;
              return (
                <div
                  key={w.periodStart}
                  title={`${periodLabel(w.periodStart, 'week')}: ${PULSE_ORDER.map((k) => `${tColour(k)} ${w[k]}`).join(', ')}`}
                  className={`flex flex-1 flex-col-reverse overflow-hidden rounded-[3px] ${w.open > 0 ? 'opacity-40' : ''} ${isLast ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
                  style={{ height: `${Math.max(8, (total / max) * 100)}%` }}
                >
                  {total === 0 ? (
                    <span className="h-full bg-muted" />
                  ) : (
                    PULSE_ORDER.map((k: TrackerColour) =>
                      w[k] ? (
                        <span
                          key={k}
                          className={COLOUR_CLASS[k]}
                          style={{ height: `${(w[k] / total) * 100}%` }}
                        />
                      ) : null,
                    )
                  )}
                </div>
              );
            })}
          </div>
          <figcaption className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{periodLabel(weeks[0]!.periodStart, 'week')}</span>
            <span>{t('caption')}</span>
            <span>{periodLabel(weeks.at(-1)!.periodStart, 'week')}</span>
          </figcaption>
        </figure>
      )}
    </section>
  );
}
