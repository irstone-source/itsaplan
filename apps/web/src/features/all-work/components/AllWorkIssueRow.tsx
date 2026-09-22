import Link from 'next/link';
import { issuePath } from '@/utils/paths';
import { LabelBadge } from '@/components/common/LabelBadge';
import type { WorkRow } from '../utils/groupByLabel';

export default function AllWorkIssueRow({ row }: { row: WorkRow }) {
  const { issue, project, labels, column } = row;

  return (
    <Link
      href={issuePath(project.key, issue.sequenceNumber)}
      className="flex min-w-0 items-center gap-3 rounded-md px-3 py-1.5 hover:bg-accent/50"
    >
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {column?.name}
      </span>
      <span className="hidden w-32 shrink-0 truncate text-end text-xs text-muted-foreground/70 md:inline">
        {project.name}
      </span>
      <span className="hidden shrink-0 items-center gap-1 lg:flex">
        {labels.map((label) => (
          <LabelBadge key={label.id} color={label.color} name={label.name} />
        ))}
      </span>
    </Link>
  );
}
