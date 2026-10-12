import { useTranslations } from 'next-intl';
import type { CycleBillables } from '@/lib/api/endpoints/cycles';
import { formatMinutes } from '@/utils/estimate';

// Planned work against the cycle's capacity, with the reserve kept free for
// unplanned step-change work drawn at the end of the bar.
export default function CycleCapacity({ capacity }: { capacity: CycleBillables['capacity'] }) {
  const t = useTranslations('cycles.billables');
  if (capacity.capacityMinutes <= 0) return null;
  const share = (m: number) => `${Math.min(100, (m / capacity.capacityMinutes) * 100)}%`;
  const over = capacity.freeMinutes < 0;

  return (
    <span
      className="flex items-center gap-2"
      title={t('reserve', { percent: capacity.reservePercent })}
    >
      <span className="text-xs text-muted-foreground">{t('capacity')}</span>
      <span className="relative h-1.5 w-32 overflow-hidden rounded-full bg-muted">
        <span
          className="absolute inset-y-0 end-0 bg-[repeating-linear-gradient(45deg,var(--color-border)_0_3px,transparent_3px_6px)]"
          style={{ width: share(capacity.reserveMinutes) }}
        />
        <span
          className={`absolute inset-y-0 start-0 rounded-full ${over ? 'bg-amber-500' : 'bg-primary'}`}
          style={{ width: share(capacity.plannedMinutes) }}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {t('planned', {
          planned: formatMinutes(capacity.plannedMinutes),
          capacity: formatMinutes(capacity.capacityMinutes),
        })}
      </span>
      <span
        className={`text-xs tabular-nums ${over ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
      >
        {over
          ? t('overbooked', { time: formatMinutes(-capacity.freeMinutes) })
          : t('free', { time: formatMinutes(capacity.freeMinutes) })}
      </span>
    </span>
  );
}
