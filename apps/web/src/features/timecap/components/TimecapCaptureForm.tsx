import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { TimeBlock } from '@/lib/api/endpoints/timecap';
import { useProjectsQuery } from '@/services/projects.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import { useCaptureBlock } from '../services/timecap.service';
import TimecapProjectSelect from './TimecapProjectSelect';
import TimecapInitiativeSelect from './TimecapInitiativeSelect';

export default function TimecapCaptureForm({
  block,
  onDone,
}: {
  block: TimeBlock;
  onDone: () => void;
}) {
  const t = useTranslations('timecap.capture');
  const { data: projects } = useProjectsQuery();
  const [projectKey, setProjectKey] = useState('');
  const [title, setTitle] = useState(block.title);
  const [initiativeId, setInitiativeId] = useState<number | null>(
    block.suggestion?.initiative?.id ?? null,
  );
  const capture = useCaptureBlock();
  const suggestedKey = block.suggestion?.issue?.projectKey;
  const project =
    projectKey || projects?.find((p) => p.key === suggestedKey)?.ref || projects?.[0]?.ref || '';
  const valid = project !== '' && title.trim() !== '';

  function submit() {
    if (!valid) return;
    capture.mutate(
      { blockId: block.id, input: { projectKey: project, title: title.trim(), initiativeId } },
      {
        onSuccess: (created) => {
          toast.success(t('created', { ticket: created.issue?.identifier ?? title.trim() }));
          onDone();
        },
      },
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
              setInitiativeId(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timecap-capture-title">{t('titleField')}</Label>
          <Input
            id="timecap-capture-title"
            dir="auto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
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
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={!valid || capture.isPending}>
          {t('action')}
        </Button>
      </DialogFooter>
    </>
  );
}
