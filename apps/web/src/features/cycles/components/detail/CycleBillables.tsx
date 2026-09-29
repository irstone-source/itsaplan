'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { getCycleBillables } from '@/lib/api/endpoints/cycles';
import { qk } from '@/services/queryKeys';
import { formatPence } from '@/utils/money';
import { formatMinutes } from '@/utils/estimate';

// What the cycle's work is worth once every issue is done: estimate in days times
// the client's day rate. Keyed under the board's issues so an edit to an estimate,
// an initiative or a state refetches it.
export default function CycleBillables({
  cycleId,
  projectKey,
}: {
  cycleId: number;
  projectKey: string;
}) {
  const t = useTranslations('cycles.billables');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: [...qk.boardIssues(projectKey), 'billables', cycleId],
    queryFn: () => getCycleBillables(cycleId),
  });
  if (!data || data.issues.length === 0) return null;

  const { totals } = data;
  const gaps = data.issues.filter(
    (i) => i.estimateMinutes == null || i.estimateMinutes === 0 || i.valuePence == null,
  );

  return (
    <div className="border-b px-6 py-2.5 text-sm">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 text-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Stat label={t('ifAllDone')} value={formatPence(totals.billablePence)} strong />
        <Stat label={t('done')} value={formatPence(totals.billableDonePence)} />
        {totals.internalPence > 0 && (
          <Stat label={t('internalCost')} value={formatPence(totals.internalPence)} />
        )}
        <Stat label={t('estimated')} value={formatMinutes(totals.estimatedMinutes)} />
        {(totals.unestimated > 0 || totals.unpriced > 0) && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" />
            {t('gaps', { unestimated: totals.unestimated, unpriced: totals.unpriced })}
          </span>
        )}
        <ChevronDown
          className={`ms-auto size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-start font-normal">{t('client')}</th>
                <th className="py-1 text-end font-normal">{t('dayRate')}</th>
                <th className="py-1 text-end font-normal">{t('value')}</th>
                <th className="py-1 text-end font-normal">{t('done')}</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={`${g.kind}-${g.initiativeId}`} className="border-t">
                  <td className="max-w-56 truncate py-1.5">
                    {g.title} <span className="text-muted-foreground">· {g.issueCount}</span>
                  </td>
                  <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                    {g.dayRatePence != null ? formatPence(g.dayRatePence) : t('noRate')}
                  </td>
                  <td className="py-1.5 text-end font-medium tabular-nums">
                    {formatPence(g.valuePence)}
                  </td>
                  <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                    {formatPence(g.donePence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {gaps.length > 0 && (
            <div className="text-xs">
              <div className="mb-1 text-muted-foreground">{t('gapsTitle')}</div>
              <ul className="space-y-1">
                {gaps.map((i) => (
                  <li key={i.id} className="flex gap-2">
                    <span className="w-16 shrink-0 text-muted-foreground">{i.identifier}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <span className="shrink-0 text-amber-600 dark:text-amber-400">
                      {i.estimateMinutes ? t('noRate') : t('noEstimate')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-semibold' : 'font-medium'}`}>
        {value}
      </span>
    </span>
  );
}
