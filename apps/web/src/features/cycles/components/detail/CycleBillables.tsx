'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronDown, Pencil, TriangleAlert } from 'lucide-react';
import { getCycleBillables } from '@/lib/api/endpoints/cycles';
import { qk } from '@/services/queryKeys';
import { useUpdateCycle } from '@/services/cycles.service';
import { formatPence } from '@/utils/money';
import { formatMinutes } from '@/utils/estimate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// What the cycle's work is worth once every issue is done, against the cycle's
// target: client work at each client's day rate, less internal work at the internal
// rate. Keyed under the board's issues so an edit to an estimate, a value, an
// initiative or a state refetches it.
export default function CycleBillables({
  cycleId,
  projectKey,
}: {
  cycleId: number;
  projectKey: string;
}) {
  const t = useTranslations('cycles.billables');
  const [open, setOpen] = useState(false);
  const queryKey = [...qk.boardIssues(projectKey), 'billables', cycleId];
  const { data } = useQuery({ queryKey, queryFn: () => getCycleBillables(cycleId) });
  if (!data) return null;

  const { totals, targetPence } = data;
  const gaps = data.issues.filter(
    (i) => !i.overridden && (!i.estimateMinutes || i.valuePence == null),
  );
  const toGo = targetPence != null ? targetPence - totals.netPence : null;
  const progress =
    targetPence && targetPence > 0
      ? Math.min(100, Math.max(0, (totals.netPence / targetPence) * 100))
      : null;

  return (
    <div className="border-b px-6 py-2.5 text-sm">
      <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-1.5">
        <Stat label={t('net')} value={formatPence(totals.netPence)} strong />
        <TargetEditor
          cycleId={cycleId}
          projectKey={projectKey}
          billablesKey={queryKey}
          targetPence={targetPence}
        />
        {progress != null && (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${toGo != null && toGo <= 0 ? 'bg-emerald-500' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="text-xs text-muted-foreground">
              {toGo != null && toGo > 0 ? t('toGo', { amount: formatPence(toGo) }) : t('targetMet')}
            </span>
          </span>
        )}
        <Stat label={t('billable')} value={formatPence(totals.billablePence)} />
        {totals.internalPence > 0 && (
          <Stat label={t('internalCost')} value={`−${formatPence(totals.internalPence)}`} />
        )}
        <Stat label={t('done')} value={formatPence(totals.billableDonePence)} />
        <Stat label={t('estimated')} value={formatMinutes(totals.estimatedMinutes)} />
        {(totals.unestimated > 0 || totals.unpriced > 0) && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" />
            {t('gaps', { unestimated: totals.unestimated, unpriced: totals.unpriced })}
          </span>
        )}
        <button
          type="button"
          className="ms-auto rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t('breakdown')}
        >
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

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
              {data.groups.map((g) => {
                const sign = g.kind === 'internal' ? '−' : '';
                return (
                  <tr key={`${g.kind}-${g.initiativeId}`} className="border-t">
                    <td className="max-w-56 truncate py-1.5">
                      {g.title} <span className="text-muted-foreground">· {g.issueCount}</span>
                    </td>
                    <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                      {g.dayRatePence != null ? formatPence(g.dayRatePence) : t('noRate')}
                    </td>
                    <td className="py-1.5 text-end font-medium tabular-nums">
                      {sign}
                      {formatPence(g.valuePence)}
                    </td>
                    <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                      {sign}
                      {formatPence(g.donePence)}
                    </td>
                  </tr>
                );
              })}
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

function TargetEditor({
  cycleId,
  projectKey,
  billablesKey,
  targetPence,
}: {
  cycleId: number;
  projectKey: string;
  billablesKey: readonly unknown[];
  targetPence: number | null;
}) {
  const t = useTranslations('cycles.billables');
  const qc = useQueryClient();
  const update = useUpdateCycle(projectKey);
  const [open, setOpen] = useState(false);
  const [pounds, setPounds] = useState('');

  function start(next: boolean) {
    if (next) setPounds(targetPence != null ? String(targetPence / 100) : '');
    setOpen(next);
  }

  async function save(value: number | null) {
    await update.mutateAsync({ id: cycleId, patch: { targetPence: value } });
    void qc.invalidateQueries({ queryKey: billablesKey });
    setOpen(false);
  }

  function submit() {
    if (pounds.trim() === '') return void save(null);
    const pence = Math.round(Number(pounds) * 100);
    if (Number.isFinite(pence) && pence >= 0) void save(pence);
  }

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-baseline gap-1.5 rounded hover:underline">
          <span className="text-xs text-muted-foreground">{t('target')}</span>
          <span className="font-medium tabular-nums">
            {targetPence != null ? formatPence(targetPence) : t('setTarget')}
          </span>
          <Pencil className="size-3 self-center text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-3">
        <p className="text-xs text-muted-foreground">{t('targetHint')}</p>
        <Input
          inputMode="decimal"
          placeholder="£"
          value={pounds}
          onChange={(e) => setPounds(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label={t('target')}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={update.isPending}>
            {t('save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
