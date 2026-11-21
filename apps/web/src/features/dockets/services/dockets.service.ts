import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type DocketRegisterParams,
  getDocket,
  listProjectDockets,
  verifyDocket,
} from '@/lib/api/endpoints/dockets';
import { qk } from '@/services/queryKeys';

export function useDocketQuery(docketId: number | null) {
  return useQuery({
    queryKey: qk.docket(docketId ?? 0),
    queryFn: () => getDocket(docketId!),
    enabled: docketId != null,
    retry: false,
  });
}

// Verifying re-reads every attachment on the server, so it runs only when asked for.
export function useDocketVerifyQuery(docketId: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.docketVerify(docketId),
    queryFn: () => verifyDocket(docketId),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useProjectDocketsQuery(projectKey: string | null, params: DocketRegisterParams) {
  return useQuery({
    queryKey: qk.projectDockets(projectKey ?? '', params),
    queryFn: () => listProjectDockets(projectKey!, params),
    enabled: projectKey != null,
    placeholderData: keepPreviousData,
  });
}
