'use client';

import { useTranslations } from 'next-intl';
import type { Finance } from '@/lib/api/endpoints/finance';
import FinanceMonthRow from './FinanceMonthRow';

export default function FinanceMonths({ data }: { data: Finance }) {
  const t = useTranslations('finance');
  return (
    <section className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-start font-normal">{t('month')}</th>
              <th className="py-1 text-start font-normal">{t('cycle')}</th>
              <th className="py-1 text-end font-normal">{t('workingDays')}</th>
              <th className="py-1 text-end font-normal">{t('target')}</th>
              <th className="py-1 text-end font-normal">{t('breakEven')}</th>
              <th className="py-1 text-end font-normal">{t('pool')}</th>
              <th className="py-1 text-end font-normal">{t('billings')}</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <FinanceMonthRow
                key={`${m.month}-${m.cycle?.targetPence}-${m.breakEvenPence}-${m.poolPercent}`}
                month={m}
                start={data.startMonth}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('rowsHint')}</p>
    </section>
  );
}
