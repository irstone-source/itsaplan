import { useTranslations } from 'next-intl';
import type { PlaybookGroup } from '@/lib/api/endpoints/playbook';
import { formatMinutes } from '@/utils/estimate';
import { STATE_CLASS } from '@/utils/timeState';

// The client's time this month against its limit, tracked in Rize: a red flag at 60%
// of the limit, down tools at 70%.
export default function PlaybookHoursBand({ group }: { group: PlaybookGroup }) {
  const t = useTranslations('playbook.hours');
  const tState = useTranslations('time.states');
  if (!group.monthlyMinutes) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {t('tracked', {
          tracked: formatMinutes(group.trackedMinutes),
          limit: formatMinutes(group.monthlyMinutes),
          flag: formatMinutes(Math.round(group.monthlyMinutes * 0.6)),
          stop: formatMinutes(Math.round(group.monthlyMinutes * 0.7)),
        })}
      </span>
      <span className={`font-medium ${STATE_CLASS[group.timeState]}`}>
        {tState(group.timeState)}
      </span>
    </div>
  );
}
