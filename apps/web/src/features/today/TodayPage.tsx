'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getToday, type TodayBucket } from '@/lib/api/endpoints/today';
import { qk } from '@/services/queryKeys';
import SectionPageSkeleton from '@/components/common/skeleton/SectionPageSkeleton';
import TodayRow from './components/TodayRow';

const BUCKETS: TodayBucket[] = ['overdue', 'due', 'started', 'cycle', 'scheduled'];

// en-CA formats as YYYY-MM-DD, the viewer's local calendar date.
const localDate = () => new Date().toLocaleDateString('en-CA');

// The viewer's assigned work across every project, grouped by why it matters today.
export default function TodayPage() {
  const t = useTranslations('today');
  const date = localDate();
  const { data, isPending } = useQuery({
    queryKey: qk.today(date),
    queryFn: ({ signal }) => getToday(date, signal),
  });

  if (isPending) return <SectionPageSkeleton />;
  const items = data?.items ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {items.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {BUCKETS.map((bucket) => {
          const rows = items.filter((i) => i.bucket === bucket);
          if (rows.length === 0) return null;
          return (
            <section key={bucket} className="flex flex-col gap-1">
              <h2 className="px-2 text-xs font-medium text-muted-foreground">
                {t(`buckets.${bucket}`)} · {rows.length}
              </h2>
              {rows.map((issue) => (
                <TodayRow key={issue.id} issue={issue} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
