import { useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useDocketVerifyQuery } from '../services/dockets.service';

export default function DocketRegisterCheck({ docketId }: { docketId: number }) {
  const t = useTranslations('dockets.register');
  const [asked, setAsked] = useState(false);
  const { data, isFetching, isError, refetch } = useDocketVerifyQuery(docketId, asked);
  if (data?.status === 'verified') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="size-4" aria-hidden />
        {t('verified')}
      </span>
    );
  }
  if (data?.status === 'changed') {
    return (
      <span
        className="flex items-center gap-1 text-xs text-destructive-text"
        title={data.problems.join('\n')}
      >
        <CircleX className="size-4" aria-hidden />
        {t('changed')}
      </span>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7"
      disabled={isFetching}
      onClick={() => (asked ? void refetch() : setAsked(true))}
    >
      {isError ? t('checkAgain') : t('check')}
    </Button>
  );
}
