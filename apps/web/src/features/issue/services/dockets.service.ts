import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  attachDocket,
  discardDocket,
  listIssueDockets,
  reviewDocket,
} from '@/lib/api/endpoints/dockets';
import { qk } from '@/services/queryKeys';

export function useIssueDocketsQuery(issueId: number) {
  return useQuery({
    queryKey: qk.issueDockets(issueId),
    queryFn: () => listIssueDockets(issueId),
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

// A review moves the issue to a done or a started column and may post a comment, so the
// issue and its feed are read again.
export function useReviewDocket(issueId: number, projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docketId,
      decision,
      note,
    }: {
      docketId: number;
      decision: 'approve' | 'return';
      note?: string;
    }) => reviewDocket(docketId, { decision, note }),
    onSuccess: (docket) => {
      void qc.invalidateQueries({ queryKey: qk.issue(issueId) });
      void qc.invalidateQueries({ queryKey: qk.feed(issueId) });
      void qc.invalidateQueries({ queryKey: qk.boardIssues(projectKey) });
      void qc.invalidateQueries({ queryKey: qk.docket(docket.id) });
    },
  });
}
