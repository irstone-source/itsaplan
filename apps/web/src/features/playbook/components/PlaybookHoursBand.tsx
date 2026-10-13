import { useTranslations } from 'next-intl';
import type { PlaybookGroup } from '@/lib/api/endpoints/playbook';
import { formatMinutes } from '@/utils/estimate';
import { formatPence } from '@/utils/money';

// The client's monthly hours allocation split into a floor (60%), a ceiling (80%)
// and a buffer (20%) released to internal work, the hours its items plan against
// it, and what the fee comes to an hour at 100%, 80% and 60% of the allocation.
export default function PlaybookHoursBand({ group }: { group: PlaybookGroup }) {
  const t = useTranslations('playbook.hours');
  const allocated = group.monthlyMinutes;
  if (!allocated) return null;
  const floor = Math.round(allocated * 0.6);
  const ceiling = Math.round(allocated * 0.8);
  const planned = group.plannedMinutes;
  const state = planned > ceiling ? 'over' : planned < floor ? 'under' : 'inside';
  const fee = group.monthlyFeePence;
  const rate = (share: number) => formatPence((fee! / ((allocated * share) / 60)) | 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {t('allocated', {
          allocated: formatMinutes(allocated),
          floor: formatMinutes(floor),
          ceiling: formatMinutes(ceiling),
          buffer: formatMinutes(allocated - ceiling),
        })}
      </span>
      <span
        className={`tabular-nums ${state === 'inside' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-400'}`}
      >
        {t(state, { planned: formatMinutes(planned) })}
      </span>
      {fee != null && fee > 0 && (
        <span className="tabular-nums">
          {t('rates', { full: rate(1), ceiling: rate(0.8), floor: rate(0.6) })}
        </span>
      )}
    </div>
  );
}
