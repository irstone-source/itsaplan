// Rize's GraphQL API, read with a key made in Rize → Settings → API. The key acts as
// the person who made it; a team admin's key reads the whole team.

const endpoint = () => process.env.RIZE_API_URL ?? 'https://api.rize.io/api/v1/graphql';

export interface RizeEntry {
  id: string;
  memberEmail: string | null;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
  title: string;
  clientName: string | null;
  projectName: string | null;
  taskName: string | null;
}

async function graphql<T>(apiKey: string, query: string, variables: object): Promise<T> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Rize answered ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`Rize: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data!;
}

const TIME_ENTRIES = /* GraphQL */ `
  query TimeEntries($startTime: ISO8601DateTime!, $endTime: ISO8601DateTime!) {
    timeEntries(startTime: $startTime, endTime: $endTime) {
      id
      startTime
      endTime
      duration
      description
      user {
        email
      }
      project {
        name
        client {
          name
        }
      }
      task {
        name
      }
    }
  }
`;

interface TimeEntriesData {
  timeEntries: {
    id: string;
    startTime: string;
    endTime: string | null;
    duration: number;
    description: string | null;
    user: { email: string } | null;
    project: { name: string; client: { name: string } | null } | null;
    task: { name: string } | null;
  }[];
}

// Every time entry that started in the window, across the team the key can read.
export async function fetchTimeEntries(apiKey: string, from: Date, to: Date): Promise<RizeEntry[]> {
  const data = await graphql<TimeEntriesData>(apiKey, TIME_ENTRIES, {
    startTime: from.toISOString(),
    endTime: to.toISOString(),
  });
  return data.timeEntries.map((e) => ({
    id: String(e.id),
    memberEmail: e.user?.email?.toLowerCase() ?? null,
    startedAt: e.startTime,
    endedAt: e.endTime,
    seconds: Math.max(0, Math.round(e.duration)),
    title: e.description ?? '',
    clientName: e.project?.client?.name ?? null,
    projectName: e.project?.name ?? null,
    taskName: e.task?.name ?? null,
  }));
}
