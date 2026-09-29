'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PoundSterling } from 'lucide-react';
import {
  BILLING_MODELS,
  type BillingModel,
  type Initiative,
  type InitiativePatch,
} from '@/lib/api/endpoints/initiatives';
import { formatPence } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The day rate the initiative's issues are valued at, and how the client is charged.
export default function InitiativeRatePill({
  initiative,
  onPatch,
}: {
  initiative: Initiative;
  onPatch: (patch: InitiativePatch) => void;
}) {
  const t = useTranslations('initiatives.billing');
  const [open, setOpen] = useState(false);
  const [pounds, setPounds] = useState('');
  const [model, setModel] = useState<BillingModel>('day_rate');

  function start(next: boolean) {
    if (next) {
      setPounds(initiative.dayRatePence != null ? String(initiative.dayRatePence / 100) : '');
      setModel(initiative.billingModel ?? 'day_rate');
    }
    setOpen(next);
  }

  function save() {
    if (model === 'internal') {
      onPatch({ dayRatePence: null, billingModel: 'internal' });
      setOpen(false);
      return;
    }
    const value = pounds.trim() === '' ? null : Math.round(Number(pounds) * 100);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    onPatch({ dayRatePence: value, billingModel: value == null ? null : model });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs font-normal">
          <PoundSterling className="size-3.5" />
          {initiative.billingModel === 'internal'
            ? t('models.internal')
            : initiative.dayRatePence != null
              ? t('perDay', { rate: formatPence(initiative.dayRatePence) })
              : t('setRate')}
          {initiative.billingModel &&
            initiative.billingModel !== 'day_rate' &&
            initiative.billingModel !== 'internal' && (
              <span className="text-muted-foreground">
                · {t(`models.${initiative.billingModel}`)}
              </span>
            )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="initiative-day-rate">
            {t('dayRate')}
          </label>
          <Input
            id="initiative-day-rate"
            disabled={model === 'internal'}
            inputMode="decimal"
            placeholder="600"
            value={pounds}
            onChange={(e) => setPounds(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('model')}</span>
          <Select value={model} onValueChange={(v) => setModel(v as BillingModel)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_MODELS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`models.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <div className="flex justify-end">
          <Button size="sm" onClick={save}>
            {t('save')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
