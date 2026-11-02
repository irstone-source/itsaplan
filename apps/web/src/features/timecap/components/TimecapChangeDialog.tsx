import { useTranslations } from 'next-intl';
import type { AllocateInput, TimeBlock } from '@/lib/api/endpoints/timecap';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TimecapChangeForm from './TimecapChangeForm';

// The form mounts with the dialog, so each opening starts from the block's state.
export default function TimecapChangeDialog({
  block,
  open,
  onOpenChange,
  onSave,
}: {
  block: TimeBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: AllocateInput, target: string) => void;
}) {
  const t = useTranslations('timecap.change');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {open && <TimecapChangeForm block={block} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}
