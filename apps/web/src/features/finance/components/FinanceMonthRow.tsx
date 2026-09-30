'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { FinanceMonth } from '@/lib/api/endpoints/finance';
import { updateCycle } from '@/lib/api/endpoints/cycles';
import { setPerformanceMonth } from '@/lib/api/endpoints/performance';
import { qk } from '@/services/queryKeys';
import { formatPence } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { monthLabel, toPence, toPounds } from '../utils/months';

const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

// One month of the plan. The target is the cycle's own; break-even and pool are the
// month's performance settings.
export default function FinanceMonthRow({ month, start }: { month: FinanceMonth; start: string }) {
  const t = useTranslations('finance');
  const qc = useQueryClient();
  const [target, setTarget] = useState(toPounds(month.cycle?.targetPence ?? null));
  const [breakEven, setBreakEven] = useState(toPounds(month.breakEvenPence));
  const [pool, setPool] = useState(String(month.poolPercent));

  const targetChanged = target !== toPounds(month.cycle?.targetPence ?? null);
  const monthChanged =
    breakEven !== toPounds(month.breakEvenPence) || pool !== String(month.poolPercent);
  const poolPercent = Number(pool);
  const valid =
    (!targetChanged || target.trim() === '' || toPence(target) >= 0) &&
    (!monthChanged ||
      (breakEven.trim() !== '' &&
        toPence(breakEven) >= 0 &&
        Number.isInteger(poolPercent) &&
        poolPercent >= 0 &&
        poolPercent <= 100));

  const save = useMutation({
    mutationFn: async () => {
      if (targetChanged && month.cycle)
        await updateCycle(month.cycle.id, {
          targetPence: target.trim() === '' ? null : toPence(target),
        });
      if (monthChanged)
        await setPerformanceMonth(month.month, {
          breakEvenPence: toPence(breakEven),
          poolPercent,
        });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.finance(start) });
      void qc.invalidateQueries({ queryKey: ['performance'] });
      toast.success(t('monthSaved', { month: monthLabel(month.month) }));
    },
  });

  return (
    <tr className="border-t">
      <td className="py-1.5 whitespace-nowrap">{monthLabel(month.month)}</td>
      <td className="py-1.5 whitespace-nowrap text-muted-foreground">
        {month.cycle ? `${day(month.cycle.startDate)} – ${day(month.cycle.endDate)}` : t('noCycle')}
      </td>
      <td className="py-1.5 text-end tabular-nums">{month.cycle?.workingDays ?? '—'}</td>
      <td className="py-1.5 text-end">
        {month.cycle ? (
          <Input
            className="ms-auto h-8 w-28 text-end"
            inputMode="decimal"
            placeholder="£"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        ) : (
          '—'
        )}
      </td>
      <td className="py-1.5 text-end">
        <Input
          className="ms-auto h-8 w-28 text-end"
          inputMode="decimal"
          placeholder="£"
          value={breakEven}
          onChange={(e) => setBreakEven(e.target.value)}
        />
      </td>
      <td className="py-1.5 text-end">
        <Input
          className="ms-auto h-8 w-16 text-end"
          inputMode="numeric"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
        />
      </td>
      <td className="py-1.5 text-end tabular-nums">{formatPence(month.billingsPence)}</td>
      <td className="py-1.5 ps-2 text-end">
        {(targetChanged || monthChanged) && (
          <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        )}
      </td>
    </tr>
  );
}
