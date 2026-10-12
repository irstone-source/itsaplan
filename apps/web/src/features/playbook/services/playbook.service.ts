import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPlaybookItem,
  deletePlaybookItem,
  listPlaybook,
  updatePlaybookItem,
  type PlaybookItemInput,
} from '@/lib/api/endpoints/playbook';

const playbookKey = (projectKey: string) => ['playbook', projectKey] as const;

export function usePlaybookQuery(projectKey: string | null) {
  return useQuery({
    queryKey: playbookKey(projectKey ?? ''),
    queryFn: () => listPlaybook(projectKey!),
    enabled: projectKey != null,
  });
}

function useRefresh(projectKey: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: playbookKey(projectKey) });
}

export function useCreatePlaybookItem(projectKey: string) {
  const refresh = useRefresh(projectKey);
  return useMutation({
    mutationFn: (input: PlaybookItemInput & { initiativeId: number; title: string }) =>
      createPlaybookItem(projectKey, input),
    onSuccess: refresh,
  });
}

export function useUpdatePlaybookItem(projectKey: string) {
  const refresh = useRefresh(projectKey);
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PlaybookItemInput }) =>
      updatePlaybookItem(projectKey, id, patch),
    onSuccess: refresh,
  });
}

export function useDeletePlaybookItem(projectKey: string) {
  const refresh = useRefresh(projectKey);
  return useMutation({
    mutationFn: (id: number) => deletePlaybookItem(projectKey, id),
    onSuccess: refresh,
  });
}
