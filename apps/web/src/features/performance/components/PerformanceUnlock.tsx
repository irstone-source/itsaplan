'use client';

import { useTranslations } from 'next-intl';
import { Lock, LockOpen } from 'lucide-react';
import type { OpenWork } from '@/lib/api/endpoints/performance';
import { formatPence } from '@/utils/money';

const hours = (minutes: number) => Math.round((minutes / 60) * 2) / 2;

// What the team still has to finish before the month's bonus pool opens. Amounts are
// passed only for the owner; a member sees hours and tickets.
export default function PerformanceUnlock({
  unlocked,
  hoursNeeded,
  ticketsNeeded,
  enoughPlanned,
  mine,
  gapPence,
  shortfallPence,
}: {
  unlocked: boolean;
  hoursNeeded: number | null;
  ticketsNeeded: number | null;
  enoughPlanned: boolean;
  mine?: OpenWork;
  gapPence?: number | null;
  shortfallPence?: number;
}) {
  const t = useTranslations('performance.unlock');

  if (unlocked) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
        <LockOpen className="mt-0.5 size-5 shrink-0 text-emerald-500" />
        <div>
          <div className="text-sm font-medium">{t('unlockedTitle')}</div>
          <p className="text-xs text-muted-foreground">{t('unlockedBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 space-y-1.5">
        <div className="text-sm font-medium">
          {t('lockedTitle')}
          {gapPence != null && (
            <span className="ms-2 font-normal text-muted-foreground">
              {t('toGo', { amount: formatPence(gapPence) })}
            </span>
          )}
        </div>
        {hoursNeeded != null && ticketsNeeded != null ? (
          <p className="text-2xl font-semibold tabular-nums">
            {t('needed', { hours: hoursNeeded, tickets: ticketsNeeded })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('noOpenWork')}</p>
        )}
        <p className="text-xs text-muted-foreground">{t('neededHint')}</p>
        {mine && (
          <p className="text-xs">
            {mine.tickets > 0
              ? t('mine', { tickets: mine.tickets, hours: hours(mine.minutes) })
              : t('mineNone')}
          </p>
        )}
        {!enoughPlanned && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {shortfallPence
              ? t('shortfallAmount', { amount: formatPence(shortfallPence) })
              : t('shortfall')}
          </p>
        )}
      </div>
    </div>
  );
}
