import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attachDocket, discardDocket, listIssueDockets } from '@/lib/api/endpoints/dockets';
import { qk } from '@/services/queryKeys';

export function useIssueDocketsQuery(issueId: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.issueDockets(issueId),
    queryFn: () => listIssueDockets(issueId),
    enabled,
  });
}

export function useAttachDocket(issueId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: attachDocket,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.issueDockets(issueId) });
      void qc.invalidateQueries({ queryKey: qk.feed(issueId) });
    },
  });
}

export function useDiscardDocket(issueId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: discardDocket,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.issueDockets(issueId) }),
  });
}
