'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleHelp, Flag, Target, UserRound } from 'lucide-react';
import type { TrackerBoard, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import Avatar from '@/components/common/Avatar';
import { formatValue } from '../utils/format';
import TrackerCellButton from './TrackerCellButton';
import TrackerMeasureDialog from './TrackerMeasureDialog';
import TrackerStatusChip from './TrackerStatusChip';

export default function TrackerRow({
  measure: m,
  periods,
  current,
  settings,
}: {
  measure: TrackerMeasure;
  periods: string[];
  current: string | undefined;
  settings: TrackerBoard['settings'];
}) {
  const t = useTranslations('tracker');
  const [editing, setEditing] = useState(false);
  const cells = new Map(m.cells.map((c) => [c.periodStart, c]));
  const last = m.cells.findLast((c) => c.closed);
  const holes = m.cells.filter((c) => c.colour === 'black').length;
  const toCheck = m.cells.filter((c) => !c.verified && c.closed).length;
  const target = m.cells.at(-1)?.target ?? null;
  const noTarget = m.rule.type === 'unset' && m.unit !== 'done';

  return (
    <tr className="group">
      <td className="sticky start-0 z-10 max-w-80 border-t bg-background px-4 py-2.5 group-hover:bg-muted/40">
        <div className="flex items-start gap-2.5">
          {m.ownerName ? (
            <Avatar name={m.ownerName} className="mt-0.5 size-6 text-[10px]" title={m.ownerName} />
          ) : (
            <span
              className="mt-0.5 size-6 shrink-0 rounded-full border border-dashed"
              title={t('noOwner')}
            />
          )}
          <div className="min-w-0 space-y-1">
            <button
              type="button"
              className="block max-w-full truncate text-start font-medium hover:underline disabled:cursor-default disabled:no-underline"
              disabled={!m.canEdit}
              onClick={() => setEditing(true)}
            >
              {m.name}
            </button>
            <p className="line-clamp-1 text-xs text-muted-foreground" title={m.definition}>
              {m.initiativeTitle ?? m.definition}
            </p>
            <div className="flex flex-wrap gap-1">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {m.loop}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t(`kind.${m.kind}`)}
              </span>
              {last?.focus && <TrackerStatusChip tone="focus" icon={Flag} label={t('focus')} />}
              {holes > 0 && (
                <TrackerStatusChip
                  tone="hole"
                  icon={CircleHelp}
                  label={t('holeCount', { count: holes })}
                />
              )}
              {toCheck > 0 && (
                <TrackerStatusChip
                  tone="check"
                  icon={UserRound}
                  label={t('checkCount', { count: toCheck })}
                />
              )}
              {noTarget && <TrackerStatusChip tone="quiet" icon={Target} label={t('noTarget')} />}
            </div>
          </div>
        </div>
      </td>
      <td className="border-t px-2 py-2.5 text-end text-xs whitespace-nowrap tabular-nums group-hover:bg-muted/40">
        {m.unit === 'done' ? t('done') : noTarget ? '—' : formatValue(m.unit, target)}
        {m.direction === 'at_most' && !noTarget && (
          <span className="block text-[11px] text-muted-foreground">{t('atMostShort')}</span>
        )}
      </td>
      {periods.map((p) => {
        const c = cells.get(p);
        return (
          <td
            key={p}
            className={`border-t px-1 py-2.5 text-center group-hover:bg-muted/40 ${p === current ? 'bg-primary/5' : ''}`}
          >
            {c ? (
              <TrackerCellButton measure={m} cell={c} />
            ) : (
              <span
                className="inline-block size-1 rounded-full bg-muted-foreground/30"
                aria-hidden
              />
            )}
          </td>
        );
      })}
      {editing && (
        <TrackerMeasureDialog settings={settings} measure={m} onClose={() => setEditing(false)} />
      )}
    </tr>
  );
}
