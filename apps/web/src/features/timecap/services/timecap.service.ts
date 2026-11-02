import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import {
  allocateTimeBlock,
  captureTimeBlock,
  confirmMyDay,
  deleteTimeRule,
  getMyTime,
  getMyTimeStatus,
  listTimeRules,
  splitTimeBlock,
  type AllocateInput,
  type CaptureInput,
} from '@/lib/api/endpoints/timecap';

const root = ['timecap'] as const;
const dayKey = (date: string) => [...root, 'day', date] as const;
const statusKey = [...root, 'status'] as const;
const rulesKey = [...root, 'rules'] as const;

export function useMyTimeQuery(date: string) {
  return useQuery({
    queryKey: dayKey(date),
    queryFn: ({ signal }) => getMyTime(date, signal),
  });
}

// The setup page polls until a sync arrives.
export function useMyTimeStatusQuery(pollMs?: number) {
  return useQuery({
    queryKey: statusKey,
    queryFn: ({ signal }) => getMyTimeStatus(signal),
    refetchInterval: pollMs ? (query) => (query.state.data?.active ? false : pollMs) : undefined,
  });
}

export function useTimeRulesQuery() {
  return useQuery({ queryKey: rulesKey, queryFn: ({ signal }) => listTimeRules(signal) });
}

export function useApiKeyCountQuery() {
  return useQuery({
    queryKey: [...root, 'apiKeyCount'] as const,
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list();
      if (error) throw new Error(error.message ?? 'API keys');
      return data?.apiKeys?.length ?? 0;
    },
  });
}

// Every write changes the day, the totals and possibly the rules, so all of them refresh.
function useInvalidateTimecap() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: root });
}

export function useAllocateBlock() {
  const invalidate = useInvalidateTimecap();
  return useMutation({
    mutationFn: ({ blockId, input }: { blockId: number; input: AllocateInput }) =>
      allocateTimeBlock(blockId, input),
    onSuccess: invalidate,
  });
}

export function useSplitBlock() {
  const invalidate = useInvalidateTimecap();
  return useMutation({
    mutationFn: ({ blockId, at }: { blockId: number; at: string }) => splitTimeBlock(blockId, at),
    onSuccess: invalidate,
  });
}

export function useCaptureBlock() {
  const invalidate = useInvalidateTimecap();
  return useMutation({
    mutationFn: ({ blockId, input }: { blockId: number; input: CaptureInput }) =>
      captureTimeBlock(blockId, input),
    onSuccess: invalidate,
  });
}

export function useConfirmDay() {
  const invalidate = useInvalidateTimecap();
  return useMutation({
    mutationFn: (date: string) => confirmMyDay(date),
    onSuccess: invalidate,
  });
}

export function useDeleteRule() {
  const invalidate = useInvalidateTimecap();
  return useMutation({
    mutationFn: (ruleId: number) => deleteTimeRule(ruleId),
    onSuccess: invalidate,
  });
}
