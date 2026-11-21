import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import { formatUkDateTime } from '@/utils/docketTime';

export default function DocketPageReview({ docket }: { docket: Docket }) {
  const t = useTranslations('dockets');
  const reviewer = docket.reviewer?.name ?? '—';
  switch (docket.reviewStatus) {
    case 'pending':
      return <span className="text-muted-foreground">{t('review.pending')}</span>;
    case 'approved':
      return (
        <span className="text-emerald-700 dark:text-emerald-300">
          {t('approvedBy', {
            name: reviewer,
            time: docket.reviewedAt ? formatUkDateTime(docket.reviewedAt) : '—',
          })}
        </span>
      );
    case 'returned':
      return (
        <span className="text-destructive-text" dir="auto">
          {t('returnedBy', { name: reviewer, note: docket.reviewNote ?? '' })}
        </span>
      );
    default:
      return <span className="text-muted-foreground">{t('review.none')}</span>;
  }
}
