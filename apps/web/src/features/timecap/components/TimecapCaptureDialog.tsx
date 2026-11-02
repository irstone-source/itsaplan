import { useTranslations } from 'next-intl';
import type { TimeBlock } from '@/lib/api/endpoints/timecap';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TimecapCaptureForm from './TimecapCaptureForm';

// The form mounts with the dialog, so each opening is prefilled from the block.
export default function TimecapCaptureDialog({
  block,
  open,
  onOpenChange,
}: {
  block: TimeBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('timecap.capture');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {open && <TimecapCaptureForm block={block} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
