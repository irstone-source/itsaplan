import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { TimeBlock } from '@/lib/api/endpoints/timecap';
import { fromZonedParts, toZonedParts } from '@/utils/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSplitBlock } from '../services/timecap.service';
import { shiftDay } from '../utils/day';

// The midpoint of the block, as the HH:mm the picker starts on.
const midpoint = (block: TimeBlock) =>
  toZonedParts(
    new Date((Date.parse(block.startedAt) + Date.parse(block.endedAt)) / 2).toISOString(),
  )?.time ?? '';

// The instant a picked time stands for: on the block's first day, else on the next
// one, for a block that runs past midnight.
function cutAt(block: TimeBlock, time: string): number {
  const day = toZonedParts(block.startedAt)?.day;
  if (!day || !time) return NaN;
  const first = Date.parse(fromZonedParts(day, time));
  if (first > Date.parse(block.startedAt)) return first;
  return Date.parse(fromZonedParts(shiftDay(day, 1), time));
}

export default function TimecapSplitDialog({
  block,
  open,
  onOpenChange,
}: {
  block: TimeBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('timecap.split');
  // Empty until edited, so each opening starts from the block as it is now.
  const [edited, setEdited] = useState('');
  const split = useSplitBlock();
  const time = edited || midpoint(block);
  const at = cutAt(block, time);
  const inside = at > Date.parse(block.startedAt) && at < Date.parse(block.endedAt);

  function setOpen(next: boolean) {
    if (!next) setEdited('');
    onOpenChange(next);
  }

  function submit() {
    if (!inside) return;
    split.mutate(
      { blockId: block.id, at: new Date(at).toISOString() },
      {
        onSuccess: () => {
          toast.success(t('done'));
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
        <div className="space-y-1.5">
          <Label htmlFor="timecap-split-at">{t('at')}</Label>
          <Input
            id="timecap-split-at"
            type="time"
            value={time}
            onChange={(e) => setEdited(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!inside || split.isPending}>
            {t('action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
