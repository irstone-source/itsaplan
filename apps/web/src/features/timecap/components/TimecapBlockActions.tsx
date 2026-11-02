import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { AllocateInput, TimeBlock } from '@/lib/api/endpoints/timecap';
import { Button } from '@/components/ui/button';
import { useAllocateBlock } from '../services/timecap.service';
import { targetLabel } from '../utils/day';
import TimecapChangeDialog from './TimecapChangeDialog';
import TimecapSplitDialog from './TimecapSplitDialog';
import TimecapCaptureDialog from './TimecapCaptureDialog';

type Dialog = 'change' | 'split' | 'capture' | null;

export default function TimecapBlockActions({ block }: { block: TimeBlock }) {
  const t = useTranslations('timecap.block');
  const [dialog, setDialog] = useState<Dialog>(null);
  const allocate = useAllocateBlock();
  const suggested =
    block.suggestion && targetLabel(block.suggestion.issue, block.suggestion.initiative);

  // A correction or an ignore offers to become a rule: the same call again, remembered.
  function offerRule(input: AllocateInput, question: string) {
    toast(question, {
      action: {
        label: t('always'),
        onClick: () =>
          allocate.mutate(
            { blockId: block.id, input: { ...input, remember: true } },
            { onSuccess: () => toast.success(t('ruleSaved')) },
          ),
      },
    });
  }

  function run(input: AllocateInput, done: string, question?: string) {
    allocate.mutate(
      { blockId: block.id, input },
      {
        onSuccess: () => {
          toast.success(done);
          if (question) offerRule(input, question);
        },
      },
    );
  }

  const busy = allocate.isPending;
  const button = (label: string, onClick: () => void) => (
    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div className="flex flex-wrap gap-1">
      {block.status === 'pending' && suggested
        ? button(t('accept'), () =>
            run({ action: 'confirm' }, t('confirmed', { target: suggested })),
          )
        : null}
      {block.status !== 'ignored' && button(t('change'), () => setDialog('change'))}
      {block.status === 'pending' && button(t('split'), () => setDialog('split'))}
      {block.status === 'pending' &&
        button(t('ignore'), () => run({ action: 'ignore' }, t('ignored'), t('alwaysIgnore')))}
      {block.status === 'pending' && button(t('capture'), () => setDialog('capture'))}
      {block.status !== 'pending' && button(t('undo'), () => run({ action: 'reset' }, t('undone')))}

      <TimecapChangeDialog
        block={block}
        open={dialog === 'change'}
        onOpenChange={(open) => setDialog(open ? 'change' : null)}
        onSave={(input, target) => {
          setDialog(null);
          run(input, t('confirmed', { target }), t('alwaysDoThis'));
        }}
      />
      <TimecapSplitDialog
        block={block}
        open={dialog === 'split'}
        onOpenChange={(open) => setDialog(open ? 'split' : null)}
      />
      <TimecapCaptureDialog
        block={block}
        open={dialog === 'capture'}
        onOpenChange={(open) => setDialog(open ? 'capture' : null)}
      />
    </div>
  );
}
