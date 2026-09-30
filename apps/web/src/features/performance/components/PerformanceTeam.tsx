'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getTeamPerformance } from '@/lib/api/endpoints/performance';
import { qk } from '@/services/queryKeys';
import { formatPence } from '@/utils/money';
import PerformanceMonthSettings from './PerformanceMonthSettings';
import PerformanceProgress from './PerformanceProgress';
import PerformanceStat from './PerformanceStat';
import PerformanceUnlock from './PerformanceUnlock';

// The owner's view of the month: settings, team totals and each person's share.
export default function PerformanceTeam({ month }: { month: string }) {
  const t = useTranslations('performance');
  const { data } = useQuery({
    queryKey: qk.teamPerformance(month),
    queryFn: () => getTeamPerformance(month),
  });
  if (!data) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">{t('team')}</h2>
      <PerformanceMonthSettings
        key={`${data.month}-${data.breakEvenPence}-${data.poolPercent}`}
        data={data}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <PerformanceStat label={t('teamBillings')} value={formatPence(data.team.billingsPence)} />
        <PerformanceStat
          label={t('aboveBreakEvenAmount')}
          value={formatPence(data.team.aboveBreakEvenPence)}
        />
        <PerformanceStat
          label={t('pool')}
          value={formatPence(data.team.poolPence)}
          hint={t('poolHint', { percent: data.poolPercent })}
        />
      </div>
      <PerformanceProgress progress={data.team.progress} />
      {data.breakEvenPence != null && (
        <PerformanceUnlock
          unlocked={data.unlock.unlocked}
          hoursNeeded={data.unlock.hoursNeeded}
          ticketsNeeded={data.unlock.ticketsNeeded}
          enoughPlanned={data.unlock.shortfallPence === 0}
          gapPence={data.unlock.gapPence}
          shortfallPence={data.unlock.shortfallPence}
        />
      )}
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-start font-normal">{t('person')}</th>
            <th className="py-1 text-end font-normal">{t('billings')}</th>
            <th className="py-1 text-end font-normal">{t('shareOfBreakEven')}</th>
            <th className="py-1 text-end font-normal">{t('bonus')}</th>
            <th className="py-1 text-end font-normal">{t('tickets')}</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((p) => (
            <tr key={p.userId} className="border-t">
              <td className="py-1.5">{p.name}</td>
              <td className="py-1.5 text-end tabular-nums">{formatPence(p.billingsPence)}</td>
              <td className="py-1.5 text-end tabular-nums">
                {p.shareOfBreakEven != null ? `${Math.round(p.shareOfBreakEven * 100)}%` : '—'}
              </td>
              <td className="py-1.5 text-end font-medium tabular-nums">
                {formatPence(p.bonusPence)}
              </td>
              <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                {p.tickets.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
