import { useTranslations } from 'next-intl';
import type { ClientTime } from '@/lib/api/endpoints/rize';
import { formatMinutes } from '@/utils/estimate';
import { STATE_BAR, STATE_CLASS } from '@/utils/timeState';

// Each client's tracked time against its monthly limit: a red flag at 60%, down tools
// at 70%. The bar's marks sit at those two points.
export default function TimeClients({ clients }: { clients: ClientTime[] }) {
  const t = useTranslations('time');
  if (clients.length === 0)
    return <p className="text-sm text-muted-foreground">{t('noClients')}</p>;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{t('clients')}</h2>
      <ul className="divide-y rounded-md border">
        {clients.map((c) => {
          const share = c.limitMinutes ? Math.min(1, c.trackedMinutes / c.limitMinutes) : 0;
          return (
            <li
              key={c.initiativeId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {c.title}
              </span>
              {c.limitMinutes ? (
                <span className="relative h-1.5 w-40 rounded-full bg-muted" dir="ltr">
                  <span
                    className={`absolute inset-y-0 start-0 rounded-full ${STATE_BAR[c.state]}`}
                    style={{ width: `${share * 100}%` }}
                  />
                  <span className="absolute inset-y-[-3px] start-[60%] w-px bg-amber-500" />
                  <span className="absolute inset-y-[-3px] start-[70%] w-px bg-red-500" />
                </span>
              ) : null}
              <span className="w-44 text-end text-muted-foreground tabular-nums">
                {c.limitMinutes
                  ? t('ofLimit', {
                      tracked: formatMinutes(c.trackedMinutes),
                      limit: formatMinutes(c.limitMinutes),
                    })
                  : t('noLimit', { tracked: formatMinutes(c.trackedMinutes) })}
              </span>
              <span className={`w-24 text-end text-xs font-medium ${STATE_CLASS[c.state]}`}>
                {t(`states.${c.state}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
