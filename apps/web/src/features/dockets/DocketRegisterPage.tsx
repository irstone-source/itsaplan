'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import SectionPageView from '@/components/common/page/SectionPageView';
import { Input } from '@/components/ui/input';
import { ukMonth } from '@/utils/docketTime';
import DocketRegisterCounts from './components/DocketRegisterCounts';
import DocketRegisterFilters, {
  type DocketRegisterFilter,
} from './components/DocketRegisterFilters';
import DocketRegisterTable from './components/DocketRegisterTable';
import { useProjectDocketsQuery } from './services/dockets.service';

// Every stamped docket of a month, with the counts a client report starts from.
export default function DocketRegisterPage() {
  const t = useTranslations('dockets.register');
  const { projectKey } = useShellRoute();
  const [month, setMonth] = useState(ukMonth);
  const [filter, setFilter] = useState<DocketRegisterFilter>({});
  const { data } = useProjectDocketsQuery(projectKey, { month, ...filter });

  return (
    <SectionPageView
      wide
      title={t('title')}
      description={t('description')}
      actions={
        <Input
          type="month"
          className="w-40"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      }
    >
      {projectKey && (
        <div className="space-y-4">
          <DocketRegisterFilters projectKey={projectKey} value={filter} onChange={setFilter} />
          {data && (
            <>
              <DocketRegisterCounts counts={data.counts} />
              <DocketRegisterTable projectKey={projectKey} dockets={data.items} />
            </>
          )}
        </div>
      )}
    </SectionPageView>
  );
}
