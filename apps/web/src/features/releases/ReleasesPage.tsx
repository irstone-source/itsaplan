'use client';

import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import SectionPageView from '@/components/common/page/SectionPageView';
import { EmptyState } from '@/components/common/page/EmptyState';
import ReleaseCard from './components/ReleaseCard';
import { useReleasesQuery } from './services/releases.service';

export default function ReleasesPage() {
  const t = useTranslations('releases');
  const { projectKey } = useShellRoute();
  const { data: releases, isPending } = useReleasesQuery(projectKey);

  return (
    <SectionPageView title={t('title')} description={t('description')}>
      {!isPending && releases?.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {releases?.map((release) => (
            <ReleaseCard key={release.id} projectKey={projectKey!} release={release} />
          ))}
        </div>
      )}
    </SectionPageView>
  );
}
