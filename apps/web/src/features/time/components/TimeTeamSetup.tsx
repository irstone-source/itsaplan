import { useTranslations } from 'next-intl';
import { formatDurationShort } from '@/utils/dates';
import { formatMinutes } from '@/utils/estimate';
import { cn } from '@/lib/utils';
import { useTeamTime } from '../services/time.service';

const DAY_MS = 86_400_000;

// For owners: which members have the agent running and how much of this week each
// has confirmed. A member's blocks stay their own; only the totals are shown.
export default function TimeTeamSetup({ projectKey }: { projectKey: string }) {
  const t = useTranslations('timecap.team');
  const { data: members } = useTeamTime(projectKey);
  if (!members) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {members.map((m) => {
            const latest = m.devices
              .map((d) => d.lastSeenAt)
              .sort()
              .at(-1);
            const active = latest != null && Date.now() - new Date(latest).getTime() < DAY_MS;
            return (
              <li
                key={m.userId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm"
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    active ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {m.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {latest ? t('seen', { time: formatDurationShort(latest) }) : t('noDevice')}
                </span>
                <span className="w-32 text-end text-xs tabular-nums">
                  {t('confirmed', {
                    time: formatMinutes(Math.round(m.confirmedSecondsThisWeek / 60)),
                  })}
                </span>
                <span className="w-28 text-end text-xs text-muted-foreground tabular-nums">
                  {t('pending', { time: formatMinutes(Math.round(m.pendingSecondsThisWeek / 60)) })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
