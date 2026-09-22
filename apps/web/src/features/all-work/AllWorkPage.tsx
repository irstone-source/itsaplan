'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { applyFilters } from '@/utils/filters';
import { issuePath } from '@/utils/paths';
import { useLocalBoardSettings } from '@/hooks/useLocalBoardSettings';
import SectionPageSkeleton from '@/components/common/skeleton/SectionPageSkeleton';
import { Input } from '@/components/ui/input';
import FilterBar from '@/components/layout/FilterBar';
import DisplayPopover from '@/components/layout/DisplayPopover';
import BoardLayout from '@/features/work-items/components/BoardLayout';
import IssueDetail from '@/features/issue/components/detail/IssueDetail';
import { countIssuesByColumn } from '@/features/work-items/utils/wipLimit';
import { useAllProjectsIssues } from './hooks/useAllProjectsIssues';
import { mergeProjects } from './utils/mergedProject';

const ALL_WORK_BOARD_STORE_KEY = 'planner_all_work_board_settings';

// Every project's issues on one board, rendered by the same layouts as the
// project work-items page (kanban/table/timeline/calendar) with filters and
// display settings. The merged project is synthetic and read-only; opening an
// issue hands the overlay the issue's real project, so edits there route to it.
export default function AllWorkPage() {
  const t = useTranslations('allWork');
  const router = useRouter();
  const { pending, work } = useAllProjectsIssues();
  const board = useLocalBoardSettings(ALL_WORK_BOARD_STORE_KEY, 0);
  const [search, setSearch] = useState('');
  const [openIssueId, setOpenIssueId] = useState<number | null>(null);

  const merged = useMemo(() => mergeProjects(work), [work]);

  const viewProject = useMemo(() => {
    const term = search.trim().toLowerCase();
    const searched = term
      ? merged.detail.issues.filter(
          (i) => i.title.toLowerCase().includes(term) || i.identifier.toLowerCase().includes(term),
        )
      : merged.detail.issues;
    return { ...merged.detail, issues: applyFilters(searched, board.filters, merged.detail) };
  }, [merged, search, board.filters]);

  if (pending) return <SectionPageSkeleton />;

  const openWork = openIssueId != null ? merged.workByIssueId.get(openIssueId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-7 w-44 ps-7 text-xs"
            />
          </div>
          <FilterBar
            filters={board.filters}
            onChange={board.setFilters}
            project={merged.detail}
            customFields={[]}
          />
        </div>
        <DisplayPopover
          view={board.view}
          onViewChange={board.changeView}
          settings={board.settings}
          onSettingsChange={board.changeSettings}
          customFields={[]}
          issueTypes={merged.detail.issueTypes}
        />
      </div>
      <div className="relative flex-1 overflow-hidden">
        <BoardLayout
          project={viewProject}
          filters={board.filters}
          columnCounts={countIssuesByColumn(merged.detail.issues)}
          customFields={[]}
          settings={board.settings}
          onSettingsChange={board.changeSettings}
          onOpenIssue={setOpenIssueId}
          onAddIssue={() => {}}
          readOnly
          view={board.view}
          widthScope="all-work"
          allIssues={merged.detail.issues}
        />
      </div>
      {openIssueId != null && openWork?.scaffold && (
        <IssueDetail
          project={{ ...openWork.scaffold, issues: openWork.issues, plannedCycles: [] }}
          issueId={openIssueId}
          onClose={() => setOpenIssueId(null)}
          onExpand={(seq) => {
            if (seq != null) router.push(issuePath(openWork.project.key, seq));
          }}
        />
      )}
    </div>
  );
}
