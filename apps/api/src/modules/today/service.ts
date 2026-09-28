import { db, cycle, issue, project, projectColumn, projectMember, team } from '@repo/db';
import { and, asc, eq, exists, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { projectRefSql } from '#modules/teams/ref';

export type TodayBucket = 'overdue' | 'due' | 'started' | 'cycle' | 'scheduled';

export interface TodayIssue {
  id: number;
  sequenceNumber: number;
  title: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  stateType: string;
  columnName: string;
  columnColor: string;
  inCurrentCycle: boolean;
  projectId: number;
  projectKey: string;
  projectRef: string;
  projectName: string;
  bucket: TodayBucket;
}

// First matching rule wins, so an overdue issue in progress shows as overdue.
export function bucketOf(
  row: Pick<TodayIssue, 'dueDate' | 'startDate' | 'stateType' | 'inCurrentCycle'>,
  date: string,
): TodayBucket {
  if (row.dueDate && row.dueDate < date) return 'overdue';
  if (row.dueDate === date) return 'due';
  if (row.stateType === 'started') return 'started';
  if (row.inCurrentCycle) return 'cycle';
  return 'scheduled';
}

// The session user's open assigned issues that need attention on `date`, across
// every project they are still a member of: overdue or due, in progress, planned
// into a cycle running on that date, or with a start date on or before it.
export async function listToday(userId: string, date: string): Promise<TodayIssue[]> {
  const inCurrentCycle = exists(
    db
      .select({ one: sql`1` })
      .from(cycle)
      .where(
        and(
          eq(cycle.id, issue.cycleId),
          lte(cycle.startDate, date),
          gte(cycle.endDate, date),
          isNull(cycle.completedAt),
        ),
      ),
  );

  const rows = await db
    .select({
      id: issue.id,
      sequenceNumber: issue.sequenceNumber,
      title: issue.title,
      priority: issue.priority,
      startDate: issue.startDate,
      dueDate: issue.dueDate,
      stateType: projectColumn.stateType,
      columnName: projectColumn.name,
      columnColor: projectColumn.color,
      inCurrentCycle: sql<boolean>`${inCurrentCycle}`,
      projectId: project.id,
      projectKey: project.key,
      projectRef: projectRefSql,
      projectName: project.name,
    })
    .from(issue)
    .innerJoin(projectColumn, eq(projectColumn.id, issue.columnId))
    .innerJoin(project, eq(project.id, issue.projectId))
    .innerJoin(team, eq(team.id, project.teamId))
    .innerJoin(
      projectMember,
      and(eq(projectMember.projectId, issue.projectId), eq(projectMember.userId, userId)),
    )
    .where(
      and(
        eq(issue.assigneeUserId, userId),
        isNull(issue.archivedAt),
        inArray(projectColumn.stateType, ['backlog', 'unstarted', 'started']),
        or(
          lte(issue.dueDate, date),
          lte(issue.startDate, date),
          eq(projectColumn.stateType, 'started'),
          inCurrentCycle,
        ),
      ),
    )
    .orderBy(asc(issue.dueDate), asc(project.name), asc(issue.sequenceNumber));

  return rows.map((r) => ({ ...r, bucket: bucketOf(r, date) }));
}
