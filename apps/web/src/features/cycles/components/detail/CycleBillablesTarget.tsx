'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { useUpdateCycle } from '@/services/cycles.service';
import { formatPence } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// The cycle's target, set inline from the billables strip.

export default function CycleBillablesTarget({
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
