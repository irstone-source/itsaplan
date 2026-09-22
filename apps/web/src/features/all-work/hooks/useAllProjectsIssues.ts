import { useQueries } from '@tanstack/react-query';
import type { BoardIssue } from '@/lib/api/endpoints/issues';
import type { Project, ProjectScaffold } from '@/lib/api/endpoints/projects';
import { getBoardIssues, getProject } from '@/lib/api/endpoints/projects';
import { useProjectsQuery } from '@/services/projects.service';
import { qk } from '@/services/queryKeys';

export interface ProjectWork {
  project: Project;
  scaffold: ProjectScaffold | undefined;
  issues: BoardIssue[];
}

// Every visible project's scaffold and board issues, fanned out over the same
// query keys the project shell uses, so opening a project afterwards hits the
// cache instead of the network.
export function useAllProjectsIssues(): { pending: boolean; work: ProjectWork[] } {
  const { data: projects, isPending: projectsPending } = useProjectsQuery();
  const visible = (projects ?? []).filter((p) => !p.isHidden);

  const scaffolds = useQueries({
    queries: visible.map((p) => ({
      queryKey: qk.project(p.key),
      queryFn: () => getProject(p.key),
    })),
  });
  const boards = useQueries({
    queries: visible.map((p) => ({
      queryKey: qk.boardIssues(p.key),
      queryFn: () => getBoardIssues(p.key),
    })),
  });

  const pending =
    projectsPending || scaffolds.some((q) => q.isPending) || boards.some((q) => q.isPending);

  const work = visible.map((project, i) => ({
    project,
    scaffold: scaffolds[i]?.data,
    issues: (boards[i]?.data?.issues ?? []).filter(
      (issue) => issue.archivedAt == null && issue.parentId == null,
    ),
  }));

  return { pending, work };
}
