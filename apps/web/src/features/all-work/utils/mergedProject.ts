import type { Assignee, Project, ProjectDetail } from '@/lib/api/endpoints/projects';
import type { BoardIssue } from '@/lib/api/endpoints/issues';
import type { Column, StateType } from '@/lib/api/endpoints/columns';
import type { IssueType } from '@/lib/api/endpoints/issueTypes';
import type { Label } from '@/lib/api/endpoints/labels';
import type { Permissions } from '@/lib/api/endpoints/roles';
import type { ProjectWork } from '../hooks/useAllProjectsIssues';

export interface MergedBoard {
  detail: ProjectDetail;
  // The owning project of each issue, for opening it against its real project.
  workByIssueId: Map<number, ProjectWork>;
}

const STATE_ORDER: StateType[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];

// Every optional section off: the merged board is read-only and its ids are
// synthetic, so nothing that writes or fetches by project key may light up.
const MERGED_PROJECT: Project = {
  id: 0,
  teamId: 0,
  teamName: '',
  key: 'ALL',
  name: 'All work',
  description: '',
  mcpEnabled: false,
  teamMcpEnabled: false,
  initiativesEnabled: false,
  dashboardsEnabled: false,
  documentsEnabled: false,
  notesEnabled: false,
  cyclesEnabled: false,
  subtasksEnabled: false,
  checklistsEnabled: false,
  issueStatsEnabled: false,
  availableFeatures: [],
  pointsEstimateEnabled: false,
  timeEstimateEnabled: false,
  timeLoggingEnabled: false,
  createdAt: '',
};

// Merges every project's scaffold and issues into one synthetic ProjectDetail the
// board layouts can render. Columns, labels and issue types are project-scoped
// ids, so they are unified by name (columns by state type + name) under fresh
// synthetic ids and each issue is remapped onto them. Assignee ids are global
// user ids and merge as-is.
export function mergeProjects(work: ProjectWork[]): MergedBoard {
  const columns = new Map<string, Column>();
  const labels = new Map<string, Label>();
  const issueTypes = new Map<string, IssueType>();
  const assignees = new Map<string, Assignee>();
  const workByIssueId = new Map<number, ProjectWork>();
  const issues: BoardIssue[] = [];

  const columnIdFor = (column: Column): number => {
    const key = `${column.stateType}:${column.name.toLowerCase()}`;
    let merged = columns.get(key);
    if (!merged) {
      merged = { ...column, id: columns.size + 1, projectId: 0 };
      columns.set(key, merged);
    }
    return merged.id;
  };

  const labelIdFor = (label: Label): number => {
    const key = label.name.toLowerCase();
    let merged = labels.get(key);
    if (!merged) {
      merged = { ...label, id: labels.size + 1, projectId: 0, groupId: null };
      labels.set(key, merged);
    }
    return merged.id;
  };

  const typeIdFor = (type: IssueType): number => {
    const key = type.name.toLowerCase();
    let merged = issueTypes.get(key);
    if (!merged) {
      merged = { ...type, id: issueTypes.size + 1, projectId: 0 };
      issueTypes.set(key, merged);
    }
    return merged.id;
  };

  for (const item of work) {
    const { scaffold } = item;
    if (!scaffold) continue;

    const columnById = new Map(scaffold.columns.map((c) => [c.id, c]));
    const labelById = new Map(scaffold.labels.map((l) => [l.id, l]));
    const typeById = new Map(scaffold.issueTypes.map((t) => [t.id, t]));
    for (const assignee of scaffold.assignees) {
      if (!assignees.has(assignee.userId)) assignees.set(assignee.userId, assignee);
    }

    for (const issue of item.issues) {
      const column = columnById.get(issue.columnId);
      if (!column) continue;
      const type = issue.typeId != null ? typeById.get(issue.typeId) : undefined;
      issues.push({
        ...issue,
        columnId: columnIdFor(column),
        typeId: type ? typeIdFor(type) : null,
        labelIds: issue.labelIds
          .map((id) => labelById.get(id))
          .filter((l): l is Label => l != null)
          .map(labelIdFor),
        // Custom fields are project-scoped and the merged board carries none.
        fieldValues: [],
      });
      workByIssueId.set(issue.id, item);
    }
  }

  const orderedColumns = [...columns.values()].sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.stateType) - STATE_ORDER.indexOf(b.stateType) ||
      a.position - b.position,
  );

  return {
    detail: {
      project: MERGED_PROJECT,
      columns: orderedColumns,
      issueTypes: [...issueTypes.values()],
      labels: [...labels.values()],
      labelGroups: [],
      assignees: [...assignees.values()],
      customFields: [],
      issueTemplates: [],
      viewer: { role: 'member', teamRole: null },
      permissions: {} as Permissions,
      issues,
      plannedCycles: [],
    },
    workByIssueId,
  };
}
