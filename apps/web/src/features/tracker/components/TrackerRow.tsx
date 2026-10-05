'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Flag } from 'lucide-react';
import type { TrackerBoard, TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { formatValue } from '../utils/format';
import TrackerCellButton from './TrackerCellButton';
import TrackerMeasureDialog from './TrackerMeasureDialog';

export default function TrackerRow({
  measure: m,
  periods,
  settings,
}: {
  measure: TrackerMeasure;
  periods: string[];
  settings: TrackerBoard['settings'];
}) {
  const t = useTranslations('tracker');
  const [editing, setEditing] = useState(false);
  const cells = new Map(m.cells.map((c) => [c.periodStart, c]));
  const latest = m.cells.at(-1);
  const focus = m.cells.some((c) => c.focus && c === m.cells.findLast((x) => x.closed));
  return (
    <tr className="border-t">
      <td className="max-w-72 px-3 py-1.5">
        <button
          type="button"
          className="block w-full truncate text-start font-medium hover:underline disabled:no-underline"
          title={m.definition}
          disabled={!m.canEdit}
          onClick={() => setEditing(true)}
        >
          {focus && <Flag className="me-1 inline size-3.5 text-red-500" aria-label={t('focus')} />}
          {m.name}
        </button>
        <div className="truncate text-xs text-muted-foreground">
          {m.loop} · {t(`kind.${m.kind}`)}
          {m.initiativeTitle ? ` · ${m.initiativeTitle}` : ` · ${m.projectKey}`}
          {m.ownerName ? ` · ${m.ownerName}` : ''}
        </div>
      </td>
      <td className="px-2 py-1.5 text-end text-xs whitespace-nowrap tabular-nums">
        {m.unit === 'done' ? t('done') : formatValue(m.unit, latest?.target ?? null)}
      </td>
      {periods.map((p) => {
        const c = cells.get(p);
        return (
          <td key={p} className="px-0.5 py-1.5 text-center">
            {c ? <TrackerCellButton measure={m} cell={c} /> : null}
          </td>
        );
      })}
      {editing && (
        <TrackerMeasureDialog settings={settings} measure={m} onClose={() => setEditing(false)} />
      )}
    </tr>
  );
}
