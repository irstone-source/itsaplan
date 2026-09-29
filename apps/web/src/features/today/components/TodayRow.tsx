'use client';

import Link from 'next/link';
import type { TodayIssue } from '@/lib/api/endpoints/today';
import { issuePath } from '@/utils/paths';
import { PriorityIcon, StateIcon } from '@/features/issue/components/shared/IssueIcons';

export default function TodayRow({ issue }: { issue: TodayIssue }) {
  return (
    <Link
      href={issuePath(issue.projectRef, issue.sequenceNumber)}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
    >
      {issue.priority ? (
        <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <span className="w-20 shrink-0 text-xs text-muted-foreground">
        {issue.projectKey}-{issue.sequenceNumber}
      </span>
      <StateIcon
        stateType={issue.stateType}
        color={issue.columnColor}
        className="size-3.5 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{issue.title}</span>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {issue.projectName}
      </span>
      {issue.dueDate && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{issue.dueDate}</span>
      )}
    </Link>
  );
}
