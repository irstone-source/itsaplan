'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { setFinanceYear, type Finance } from '@/lib/api/endpoints/finance';
import { qk } from '@/services/queryKeys';
import { formatPence } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toPence, toPounds } from '../utils/months';

export default function FinanceYearForm({
  data,
  onStartChange,
}: {
  data: Finance;
  onStartChange: (start: string) => void;
}) {
  const t = useTranslations('finance');
  const qc = useQueryClient();
  const [pounds, setPounds] = useState(toPounds(data.revenueTargetPence));
  const [projectId, setProjectId] = useState(
    String(data.projectId ?? data.projects.find((p) => p.key === 'CON')?.id ?? ''),
  );
  const save = useMutation({
    mutationFn: () =>
      setFinanceYear(data.startMonth, {
        revenueTargetPence: toPence(pounds),
        projectId: Number(projectId),
      }),
    onSuccess: (next) => {
      qc.setQueryData(qk.finance(next.startMonth), next);
      onStartChange(next.startMonth);
      toast.success(t('yearSaved'));
    },
  });
  const valid = pounds.trim() !== '' && toPence(pounds) >= 0 && projectId !== '';
  const planned = data.months.reduce((sum, m) => sum + (m.cycle?.targetPence ?? 0), 0);
  const billed = data.months.reduce((sum, m) => sum + m.billingsPence, 0);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('startMonth')}</span>
          <Input
            type="month"
            className="w-40"
            value={data.startMonth}
            onChange={(e) => e.target.value && onStartChange(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('revenueTarget')}</span>
          <Input
            className="w-40"
            inputMode="decimal"
            placeholder="£"
            value={pounds}
            onChange={(e) => setPounds(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('cyclesFrom')}</span>
          <select
            className="h-9 rounded-md border bg-transparent px-2 text-sm text-foreground"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="" disabled>
              —
            </option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
          {t('saveAndSpread')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('spreadHint')}</p>
      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          <span className="text-muted-foreground">{t('plannedInCycles')} </span>
          <span className="font-medium tabular-nums">{formatPence(planned)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">{t('billedToDate')} </span>
          <span className="font-medium tabular-nums">{formatPence(billed)}</span>
        </span>
      </div>
    </section>
  );
}
