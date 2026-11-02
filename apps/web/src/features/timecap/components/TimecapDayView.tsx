import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirmDay, useMyTimeQuery } from '../services/timecap.service';
import { formatSeconds } from '../utils/day';
import TimecapDeviceStatus from './TimecapDeviceStatus';
import TimecapBlockRow from './TimecapBlockRow';

// One day's blocks in time order, with the device line and the day's totals.
export default function TimecapDayView({ date }: { date: string }) {
  const t = useTranslations('timecap.my');
  const { data, isPending } = useMyTimeQuery(date);
  const confirmDay = useConfirmDay();

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  const blocks = [...data.blocks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  // The count includes blocks of a closed week, which confirm-day skips.
  const canConfirm = data.totals.confidentPending > 0 && blocks.some((b) => !b.locked);

  return (
    <div className="flex flex-col gap-3">
      <TimecapDeviceStatus devices={data.devices} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground tabular-nums">
          {t('totals', {
            captured: formatSeconds(data.totals.capturedSeconds),
            confirmed: formatSeconds(data.totals.confirmedSeconds),
            pending: formatSeconds(data.totals.pendingSeconds),
          })}
        </p>
        {canConfirm && (
          <Button
            size="sm"
            disabled={confirmDay.isPending}
            onClick={() =>
              confirmDay.mutate(date, {
                onSuccess: (r) => toast.success(t('dayConfirmed', { count: r.confirmed })),
              })
            }
          >
            {t('confirmSuggested', { count: data.totals.confidentPending })}
          </Button>
        )}
      </div>
      {blocks.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {blocks.map((block) => (
            <TimecapBlockRow key={block.id} block={block} />
          ))}
        </ul>
      )}
    </div>
  );
}
