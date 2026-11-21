import { useState } from 'react';
import Link from 'next/link';
import { Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import DocketOutcomeBadge from '@/components/common/dockets/DocketOutcomeBadge';
import DocketReviewBadge from '@/components/common/dockets/DocketReviewBadge';
import { Button } from '@/components/ui/button';
import { formatUkDateTime } from '@/utils/docketTime';
import { docketPath } from '@/utils/paths';
import { useReviewDocket } from '../../services/dockets.service';
import IssueDocketReturnDialog from './IssueDocketReturnDialog';

export default function IssueStampedDocketRow({
  docket,
  projectKey,
}: {
  docket: Docket;
  projectKey: string;
}) {
  const t = useTranslations('dockets');
  const review = useReviewDocket(docket.issue.id, projectKey);
  const [returning, setReturning] = useState(false);
  const canDecide = docket.canReview && docket.reviewStatus === 'pending';

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <Stamp className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-mono font-medium" dir="ltr">
        {docket.number}
      </span>
      {docket.outcome && <DocketOutcomeBadge outcome={docket.outcome} />}
      <DocketReviewBadge status={docket.reviewStatus} />
      {docket.stampedAt && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('panel.stampedAt', { time: formatUkDateTime(docket.stampedAt) })}
        </span>
      )}
      <div className="ms-auto flex gap-1">
        {canDecide && (
          <>
            <Button
              size="sm"
              disabled={review.isPending}
              onClick={async () => {
                const result = await review.mutateAsync({
                  docketId: docket.id,
                  decision: 'approve',
                });
                if (result.moved === false) toast.warning(t('panel.approvedNotMoved'));
                else toast.success(t('panel.approved'));
              }}
            >
              {t('panel.approve')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={review.isPending}
              onClick={() => setReturning(true)}
            >
              {t('panel.return')}
            </Button>
          </>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link href={docketPath(docket.id)}>{t('panel.open')}</Link>
        </Button>
      </div>
      <IssueDocketReturnDialog
        open={returning}
        onOpenChange={setReturning}
        number={docket.number ?? ''}
        pending={review.isPending}
        onSubmit={async (note) => {
          await review.mutateAsync({ docketId: docket.id, decision: 'return', note });
          setReturning(false);
          toast.success(t('panel.returned'));
        }}
      />
    </li>
  );
}
