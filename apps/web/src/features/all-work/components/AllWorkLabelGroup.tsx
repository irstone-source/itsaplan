import { useTranslations } from 'next-intl';
import type { WorkLabelGroup } from '../utils/groupByLabel';
import AllWorkIssueRow from './AllWorkIssueRow';

export default function AllWorkLabelGroup({ group }: { group: WorkLabelGroup }) {
  const t = useTranslations('allWork');

  return (
    <section>
      <header className="flex items-center gap-2 px-3 py-2">
        <span
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40"
          style={group.color ? { backgroundColor: group.color } : undefined}
        />
        <h2 className="text-sm font-medium">{group.name ?? t('noLabel')}</h2>
        <span className="text-xs text-muted-foreground">{group.rows.length}</span>
      </header>
      <div className="flex flex-col">
        {group.rows.map((row) => (
          <AllWorkIssueRow key={`${row.project.id}:${row.issue.id}`} row={row} />
        ))}
      </div>
    </section>
  );
}
