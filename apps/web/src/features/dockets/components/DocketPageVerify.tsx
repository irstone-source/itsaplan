import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatUkDateTime } from '@/utils/docketTime';
import { useDocketVerifyQuery } from '../services/dockets.service';

export default function DocketPageVerify({ docketId }: { docketId: number }) {
  const t = useTranslations('dockets');
  const { data, isError, isFetching, refetch } = useDocketVerifyQuery(docketId, true);
  const again = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 print:hidden"
      disabled={isFetching}
      onClick={() => void refetch()}
    >
      {t('checkAgain')}
    </Button>
  );
  if (isFetching && !data) return <p className="text-sm text-muted-foreground">{t('verifying')}</p>;
  if (isError || !data) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {t('verifyFailed')}
        {again}
      </div>
    );
  }
  if (data.status === 'verified') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {t('verified', { time: formatUkDateTime(data.checkedAt) })}
        </p>
        {again}
      </div>
    );
  }
  return (
    <div className="space-y-1 text-sm text-destructive-text">
      <p className="flex items-center gap-2 font-medium">
        <CircleX className="size-4 shrink-0" aria-hidden />
        {t('changed')}
        {again}
      </p>
      <ul className="list-disc ps-10">
        {data.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}
