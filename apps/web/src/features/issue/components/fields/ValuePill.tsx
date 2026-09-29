'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IssueValue } from '@/utils/money';
import { formatValue } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// An issue's value: estimate × day rate, or a figure set by hand in its place.
export default function ValuePill({
  value,
  overridePence,
  onChange,
  readOnly,
}: {
  value: IssueValue | null;
  overridePence: number | null;
  onChange: (pence: number | null) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations('issue.value');
  const [open, setOpen] = useState(false);
  const [pounds, setPounds] = useState('');

  const label = value ? formatValue(value) : t('none');
  if (readOnly) return <span className="text-sm tabular-nums">{label}</span>;

  function start(next: boolean) {
    if (next) setPounds(overridePence != null ? String(overridePence / 100) : '');
    setOpen(next);
  }

  function save() {
    const pence = Math.round(Number(pounds) * 100);
    if (pounds.trim() === '' || !Number.isFinite(pence) || pence < 0) return;
    onChange(pence);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 font-normal tabular-nums">
          {label}
          {value?.overridden && (
            <span className="text-xs text-muted-foreground">{t('manual')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <Input
          inputMode="decimal"
          placeholder="£"
          value={pounds}
          onChange={(e) => setPounds(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          aria-label={t('amount')}
        />
        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={overridePence == null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {t('useEstimate')}
          </Button>
          <Button size="sm" onClick={save}>
            {t('set')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
