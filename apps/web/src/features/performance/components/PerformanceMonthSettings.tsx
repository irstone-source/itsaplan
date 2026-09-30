'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { setPerformanceMonth, type TeamPerformance } from '@/lib/api/endpoints/performance';
import { qk } from '@/services/queryKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// The month's break-even and bonus pool, set by the instance owner.
export default function PerformanceMonthSettings({ data }: { data: TeamPerformance }) {
  const t = useTranslations('performance');
  const qc = useQueryClient();
  const [pounds, setPounds] = useState(
    data.breakEvenPence != null ? String(data.breakEvenPence / 100) : '',
  );
  const [pool, setPool] = useState(String(data.poolPercent));
  const save = useMutation({
    mutationFn: (body: { breakEvenPence: number; poolPercent: number }) =>
      setPerformanceMonth(data.month, body),
    onSuccess: (next) => {
      qc.setQueryData(qk.teamPerformance(data.month), next);
      void qc.invalidateQueries({ queryKey: qk.myPerformance(data.month) });
      toast.success(t('saved'));
    },
  });
  const breakEvenPence = Math.round(Number(pounds) * 100);
  const poolPercent = Number(pool);
  const valid =
    pounds.trim() !== '' &&
    Number.isFinite(breakEvenPence) &&
    breakEvenPence >= 0 &&
    Number.isInteger(poolPercent) &&
    poolPercent >= 0 &&
    poolPercent <= 100;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <label className="space-y-1 text-xs text-muted-foreground">
        <span>{t('breakEven')}</span>
        <Input
          className="w-36"
          inputMode="decimal"
          placeholder="£"
          value={pounds}
          onChange={(e) => setPounds(e.target.value)}
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        <span>{t('poolPercent')}</span>
        <Input
          className="w-24"
          inputMode="numeric"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
        />
      </label>
      <Button
        disabled={!valid || save.isPending}
        onClick={() => save.mutate({ breakEvenPence, poolPercent })}
      >
        {t('save')}
      </Button>
      <p className="basis-full text-xs text-muted-foreground">{t('settingsHint')}</p>
    </div>
  );
}
