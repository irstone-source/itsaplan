'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { InstanceUserDetail } from '@/lib/api/endpoints/god';
import Modal from '@/components/common/overlay/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useAssignInstanceUserProjects,
  useInstanceProjectOptionsQuery,
} from '../../services/god.service';

// Picks several projects, across teams, to add one account to at once. Projects the
// account is already in are shown ticked and cannot be changed here.
export default function GodUserProjectsDialog({
  user,
  onClose,
}: {
  user: InstanceUserDetail;
  onClose: () => void;
}) {
  const t = useTranslations('god.userPanel');
  const tCommon = useTranslations('common');
  const options = useInstanceProjectOptionsQuery();
  const assign = useAssignInstanceUserProjects();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const joined = new Set(user.projects.map((p) => p.projectId));

  const byTeam = new Map<string, NonNullable<typeof options.data>>();
  for (const project of options.data ?? []) {
    byTeam.set(project.teamName, [...(byTeam.get(project.teamName) ?? []), project]);
  }

  function toggle(id: number, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  async function save() {
    try {
      await assign.mutateAsync({ userId: user.id, projectIds: [...selected] });
      toast.success(t('addedToProjects', { count: selected.size }));
      onClose();
    } catch {
      // The failure already surfaced through the global mutation error toast.
    }
  }

  return (
    <Modal title={t('addToProjectsTitle', { name: user.name || user.email })} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('addToProjectsHint')}</p>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {[...byTeam.entries()].map(([teamName, projects]) => (
            <div key={teamName} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{teamName}</div>
              {projects.map((project) => {
                const isJoined = joined.has(project.id);
                return (
                  <label
                    key={project.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent has-[:disabled]:opacity-60"
                  >
                    <Checkbox
                      checked={isJoined || selected.has(project.id)}
                      disabled={isJoined}
                      onCheckedChange={(checked) => toggle(project.id, checked === true)}
                    />
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {project.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={assign.isPending}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={selected.size === 0 || assign.isPending}
          >
            {assign.isPending
              ? tCommon('saving')
              : t('addToProjectsSubmit', { count: selected.size })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
