import type { BoardIssue } from '@/lib/api/endpoints/issues';
import type { Column } from '@/lib/api/endpoints/columns';
import type { Label } from '@/lib/api/endpoints/labels';
import type { Project } from '@/lib/api/endpoints/projects';
import type { ProjectWork } from '../hooks/useAllProjectsIssues';

export interface WorkRow {
  issue: BoardIssue;
  project: Project;
  labels: Label[];
  column: Column | null;
}

export interface WorkLabelGroup {
  // Lower-cased label name, or null for issues without a label.
  key: string | null;
  name: string | null;
  color: string | null;
  rows: WorkRow[];
}

// Groups every issue by its first label's name. Labels are project-scoped ids, so
// the grouping unifies them by name across projects; the colour comes from the
// first label seen under that name. Issues without labels form the last group.
export function groupByLabel(work: ProjectWork[]): WorkLabelGroup[] {
  const groups = new Map<string | null, WorkLabelGroup>();

  for (const { project, labelById, columnById, issues } of work) {
    for (const issue of issues) {
      const labels = issue.labelIds
        .map((id) => labelById.get(id))
        .filter((l): l is Label => l != null);
      const first = labels[0] ?? null;
      const key = first ? first.name.toLowerCase() : null;

      let group = groups.get(key);
      if (!group) {
        group = { key, name: first?.name ?? null, color: first?.color ?? null, rows: [] };
        groups.set(key, group);
      }
      group.rows.push({
        issue,
        project,
        labels,
        column: columnById.get(issue.columnId) ?? null,
      });
    }
  }

  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) =>
        a.project.key.localeCompare(b.project.key) ||
        a.issue.sequenceNumber - b.issue.sequenceNumber,
    );
  }

  // Largest category first; the label-less group always last.
  return [...groups.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return b.rows.length - a.rows.length || a.name!.localeCompare(b.name!);
  });
}
