'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getMyPerformance } from '@/lib/api/endpoints/performance';
import { qk } from '@/services/queryKeys';
import { formatPence } from '@/utils/money';
import PerformanceProgress from './PerformanceProgress';
import PerformanceStat from './PerformanceStat';
import PerformanceTickets from './PerformanceTickets';

// A member's own month: billings, share of break-even, bonus, and the team's progress.
export default function PerformanceMine({ month }: { month: string }) {
  const t = useTranslations('performance');
  const { data } = useQuery({
    queryKey: qk.myPerformance(month),
    queryFn: () => getMyPerformance(month),
  });
  if (!data) return null;
  const share = data.me.shareOfBreakEven;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">{t('mine')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <PerformanceStat
          label={t('billings')}
          value={formatPence(data.me.billingsPence)}
          hint={t('billingsHint')}
        />
        <PerformanceStat
          label={t('shareOfBreakEven')}
          value={share != null ? `${Math.round(share * 100)}%` : '—'}
          hint={t('shareHint')}
        />
        <PerformanceStat
          label={t('bonus')}
          value={formatPence(data.me.bonusPence)}
          hint={t('bonusHint')}
        />
      </div>
      <PerformanceProgress progress={data.teamProgress} />
      <PerformanceTickets tickets={data.me.tickets} />
    </section>
  );
}
