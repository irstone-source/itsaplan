import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { TimeDevice } from '@/lib/api/endpoints/timecap';
import { formatDurationShort } from '@/utils/dates';
import { timeSetupPath } from '@/utils/paths';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;

// One line per computer: green when seen in the last 24 hours, amber when the agent
// reports the tracker down or has not been seen for a day.
export default function TimecapDeviceStatus({ devices }: { devices: TimeDevice[] }) {
  const t = useTranslations('timecap');

  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('my.noDevice')}{' '}
        <Link href={timeSetupPath()} className="underline underline-offset-2">
          {t('my.setUp')}
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {devices.map((d) => {
        const fresh = Date.now() - new Date(d.lastSeenAt).getTime() < DAY_MS;
        const ok = fresh && d.trackerOk;
        return (
          <li key={d.name} className="flex items-center gap-1.5">
            <span
              className={cn('size-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-amber-500')}
              aria-hidden
            />
            {t('device.seen', { name: d.name, time: formatDurationShort(d.lastSeenAt) })}
            {!d.trackerOk && <span> · {t('device.trackerNotRunning')}</span>}
            {!fresh && <span> · {t('device.stale')}</span>}
          </li>
        );
      })}
    </ul>
  );
}
