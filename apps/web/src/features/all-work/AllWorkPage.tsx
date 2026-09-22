'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import SectionPageSkeleton from '@/components/common/skeleton/SectionPageSkeleton';
import { useAllProjectsIssues } from './hooks/useAllProjectsIssues';
import { groupByLabel } from './utils/groupByLabel';
import AllWorkLabelGroup from './components/AllWorkLabelGroup';

// Every project's issues on one page, grouped by label across project boundaries.
export default function AllWorkPage() {
  const t = useTranslations('allWork');
  const { pending, work } = useAllProjectsIssues();
  const groups = useMemo(() => groupByLabel(work), [work]);

  if (pending) return <SectionPageSkeleton />;

  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-2 py-4 sm:px-4">
        {groups.map((group) => (
          <AllWorkLabelGroup key={group.key ?? 'no-label'} group={group} />
        ))}
      </div>
    </div>
  );
}
