import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import DocketOutcomeBadge from '@/components/common/dockets/DocketOutcomeBadge';
import { formatMinutes } from '@/utils/estimate';
import { formatUkRange } from '@/utils/docketTime';
import { issueByIdPath } from '@/utils/paths';
import DocketPageFact from './DocketPageFact';
import DocketPageReview from './DocketPageReview';

export default function DocketPageFacts({ docket }: { docket: Docket }) {
  const t = useTranslations('dockets');
  const { sessionStartedAt: start, sessionEndedAt: end, activeSeconds } = docket;
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 print:grid-cols-2">
      <DocketPageFact label={t('ticket')}>
        <Link href={issueByIdPath(docket.issue.id)} className="hover:underline">
          <span className="font-mono font-medium" dir="ltr">
            {docket.issue.identifier}
          </span>{' '}
          <span dir="auto">{docket.issue.title}</span>
        </Link>
      </DocketPageFact>
      <DocketPageFact label={t('client')}>
        <span dir="auto">{docket.client?.name ?? t('noClient')}</span>
      </DocketPageFact>
      <DocketPageFact label={docket.kind === 'agent' ? t('agent') : t('person')}>
        {docket.author?.name ?? '—'}
        {docket.device && (
          <span className="text-muted-foreground"> {t('device', { device: docket.device })}</span>
        )}
      </DocketPageFact>
      {start && end && (
        <DocketPageFact label={t('session')}>
          <span className="tabular-nums">
            {t('sessionRange', { range: formatUkRange(start, end) })}
          </span>
          {activeSeconds != null && (
            <span className="text-muted-foreground">
              {' · '}
              {t('active', { duration: formatMinutes(Math.round(activeSeconds / 60)) })}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">{t('reportedByDevice')}</span>
        </DocketPageFact>
      )}
      {docket.outcome && (
        <DocketPageFact label={t('outcomeLabel')}>
          <DocketOutcomeBadge outcome={docket.outcome} />
        </DocketPageFact>
      )}
      <DocketPageFact label={t('reviewLabel')}>
        <DocketPageReview docket={docket} />
      </DocketPageFact>
    </dl>
  );
}
