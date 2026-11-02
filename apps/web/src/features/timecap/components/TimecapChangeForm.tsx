import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AllocateInput, TimeBlock, TimeIssueRef } from '@/lib/api/endpoints/timecap';
import { useProjectsQuery } from '@/services/projects.service';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import TimecapProjectSelect from './TimecapProjectSelect';
import TimecapTicketPicker from './TimecapTicketPicker';
import TimecapInitiativeSelect from './TimecapInitiativeSelect';

export default function TimecapChangeForm({
  block,
  onSave,
}: {
  block: TimeBlock;
  onSave: (input: AllocateInput, target: string) => void;
}) {
  const t = useTranslations('timecap.change');
  const { data: projects } = useProjectsQuery();
  const current = block.issue ?? block.suggestion?.issue ?? null;
  const [projectKey, setProjectKey] = useState('');
  const [issue, setIssue] = useState<TimeIssueRef | null>(current);
  const [initiativeId, setInitiativeId] = useState<number | null>(
    block.initiative?.id ?? block.suggestion?.initiative?.id ?? null,
  );
  // A ref is picked here; the block's ticket names only its project key.
  const project =
    projectKey ||
    projects?.find((p) => p.key === current?.projectKey)?.ref ||
    projects?.[0]?.ref ||
    '';
  const valid = issue != null || initiativeId != null;

  function submit() {
    if (!valid) return;
    onSave(
      { action: 'confirm', issueId: issue?.id ?? null, initiativeId },
      issue?.identifier ?? t('initiative'),
    );
  }

  return (
    <>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label>{t('project')}</Label>
          <TimecapProjectSelect
            value={project}
            onChange={(ref) => {
              setProjectKey(ref);
              setIssue(null);
              setInitiativeId(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('ticket')}</Label>
          {project && (
            <TimecapTicketPicker projectKey={project} value={issue} onChange={setIssue} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t('initiative')}</Label>
          <TimecapInitiativeSelect
            projectKey={project || null}
            value={initiativeId}
            noneLabel={t('noInitiative')}
            onChange={setInitiativeId}
          />
        </div>
        {!valid && <p className="text-xs text-muted-foreground">{t('needTarget')}</p>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={!valid}>
          {t('save')}
        </Button>
      </DialogFooter>
    </>
  );
}
