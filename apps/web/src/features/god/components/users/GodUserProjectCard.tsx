'use client';

import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { PermissionCatalog } from '@/lib/api/endpoints/roles';
import type { InstanceUserProject } from '@/lib/api/endpoints/god';
import { formatShortDate } from '@/utils/dates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AccessCard from '@/components/common/permissions/AccessCard';
import { useRemoveInstanceUserProject } from '../../services/god.service';

// One project the user can reach, as a row in the account panel.
export default function GodUserProjectCard({
  userId,
  project,
  catalog,
}: {
  userId: string;
  project: InstanceUserProject;
  catalog: PermissionCatalog | undefined;
}) {
  const t = useTranslations('permissions');
  const tCommon = useTranslations('common');
  const tPanel = useTranslations('god.userPanel');
  const remove = useRemoveInstanceUserProject();
  const isOwner = project.role === 'owner';
  const removable = !(isOwner && project.ownerCount <= 1);

  async function removeFromProject() {
    try {
      await remove.mutateAsync({ userId, projectId: project.projectId });
      toast.success(tPanel('removedFromProject', { project: project.projectKey }));
    } catch {
      // The failure already surfaced through the global mutation error toast.
    }
  }

  return (
    <AccessCard
      permissions={project.permissions}
      catalog={catalog}
      trailing={
        removable && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={tPanel('removeFromProject', { project: project.projectKey })}
            disabled={remove.isPending}
            onClick={() => void removeFromProject()}
          >
            <X />
          </Button>
        )
      }
      header={
        <>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {project.projectKey}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{project.projectName}</span>
          <Badge
            variant={isOwner ? 'default' : 'secondary'}
            className="px-1.5 py-0 text-[10px] font-medium"
          >
            {isOwner ? tCommon('owner') : (project.roleName ?? tCommon('member'))}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t('joined', { date: formatShortDate(project.joinedAt) })}
          </span>
        </>
      }
    />
  );
}
