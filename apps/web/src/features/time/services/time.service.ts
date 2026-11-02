import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTimeOverview, linkTimeEntry, mapRizeClient } from '@/lib/api/endpoints/rize';
import { getTeamTime } from '@/lib/api/endpoints/timecap';

const timeKey = (projectKey: string, month: string) => ['time', projectKey, month] as const;

export function useTeamTime(projectKey: string | null) {
  return useQuery({
    queryKey: ['time', projectKey ?? '', 'team'] as const,
    queryFn: ({ signal }) => getTeamTime(projectKey!, signal),
    enabled: projectKey != null,
  });
}

export function useTimeOverview(projectKey: string | null, month: string) {
  return useQuery({
    queryKey: timeKey(projectKey ?? '', month),
    queryFn: () => getTimeOverview(projectKey!, month),
    enabled: projectKey != null,
  });
}

export function useLinkTimeEntry(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, issueId }: { entryId: number; issueId: number | null }) =>
      linkTimeEntry(projectKey, entryId, issueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time', projectKey] }),
  });
}

export function useMapRizeClient(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      rizeClient,
      initiativeId,
    }: {
      rizeClient: string;
      initiativeId: number | null;
    }) => mapRizeClient(projectKey, rizeClient, initiativeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time', projectKey] });
      void qc.invalidateQueries({ queryKey: ['playbook', projectKey] });
    },
  });
}
