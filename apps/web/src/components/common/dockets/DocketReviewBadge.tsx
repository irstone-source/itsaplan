import { useTranslations } from 'next-intl';
import type { DocketReviewStatus } from '@/lib/api/endpoints/dockets';
import { Badge } from '@/components/ui/badge';

const TONE: Record<DocketReviewStatus, string> = {
  pending: 'text-muted-foreground',
  approved: 'border-emerald-600/30 text-emerald-700 dark:text-emerald-300',
  returned: 'border-destructive/30 text-destructive-text',
};

// A blocked docket is not sent for review, so it has no status.
export default function DocketReviewBadge({ status }: { status: DocketReviewStatus | null }) {
  const t = useTranslations('dockets.review');
  if (!status) return <span className="text-xs text-muted-foreground">{t('none')}</span>;
  return (
    <Badge variant="outline" className={TONE[status]}>
      {t(status)}
    </Badge>
  );
}
