import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBillingSettings } from '@/lib/api/endpoints/settings';
import { ShellCtx } from '@/context/shellContext';
import { issueValue } from '@/utils/money';
import { qk } from './queryKeys';

export function useBillingSettingsQuery() {
  return useQuery({
    queryKey: qk.billingSettings,
    queryFn: getBillingSettings,
    staleTime: 5 * 60_000,
  });
}

// The value of an issue (see issueValue). Read outside a project shell too (All
// Work), where no project is loaded and only an internal initiative marks cost.
export function useIssueValue(issue: Parameters<typeof issueValue>[0]) {
  const { data: billing } = useBillingSettingsQuery();
  const shell = useContext(ShellCtx);
  return issueValue(issue, billing, shell?.project?.project.internal ?? false);
}
