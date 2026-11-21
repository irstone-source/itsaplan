import { Stamp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import { BrandMark, BrandName } from '@/components/brand/Branding';
import { formatUkDateTime, formatUtcDateTime } from '@/utils/docketTime';

export default function DocketPageHeader({ docket }: { docket: Docket }) {
  const t = useTranslations('dockets');
  return (
    <header className="space-y-5">
      <div className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-5">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <span className="text-lg font-semibold">
            <BrandName />
          </span>
        </div>
        <div className="text-end">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            {t('title')}
          </p>
          <p className="font-mono text-3xl font-semibold tabular-nums" dir="ltr">
            {docket.number ?? '—'}
          </p>
        </div>
      </div>
      {docket.stampedAt ? (
        <p className="inline-flex items-center gap-2 rounded-md border-2 border-dashed border-foreground/40 px-3 py-1.5 text-sm font-medium tabular-nums">
          <Stamp className="size-4" aria-hidden />
          {t('stamped', {
            uk: formatUkDateTime(docket.stampedAt),
            utc: formatUtcDateTime(docket.stampedAt),
          })}
        </p>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground">
          {t('notStamped')}
        </p>
      )}
    </header>
  );
}
