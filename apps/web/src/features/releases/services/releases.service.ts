import { useQuery } from '@tanstack/react-query';
import { listReleases } from '@/lib/api/endpoints/git';

export function useReleasesQuery(projectKey: string | null) {
  return useQuery({
    queryKey: ['releases', projectKey],
    queryFn: () => listReleases(projectKey!),
    enabled: !!projectKey,
  });
}
