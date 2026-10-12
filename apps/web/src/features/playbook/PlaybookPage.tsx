'use client';

import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import { usePermissions } from '@/hooks/usePermissions';
import SectionPageView from '@/components/common/page/SectionPageView';
import { EmptyState } from '@/components/common/page/EmptyState';
import PlaybookAddDialog from './components/PlaybookAddDialog';
import PlaybookGroupCard from './components/PlaybookGroupCard';
import { usePlaybookQuery } from './services/playbook.service';

export default function PlaybookPage() {
  const t = useTranslations('playbook');
  const { projectKey } = useShellRoute();
  const { can } = usePermissions();
  const { data: groups, isPending } = usePlaybookQuery(projectKey);
  const canEdit = can('initiatives', 'edit');

  return (
    <SectionPageView
      title={t('title')}
      description={t('description')}
      actions={
        projectKey && can('initiatives', 'create') ? (
          <PlaybookAddDialog projectKey={projectKey} />
        ) : null
      }
      wide
    >
      {!isPending && groups?.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <div className="space-y-6">
          {groups?.map((group) => (
            <PlaybookGroupCard
              key={group.initiativeId}
              projectKey={projectKey!}
              group={group}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </SectionPageView>
  );
}
