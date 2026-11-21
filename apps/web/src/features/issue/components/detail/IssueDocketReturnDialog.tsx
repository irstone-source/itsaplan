import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export default function IssueDocketReturnDialog({
  open,
  onOpenChange,
  number,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: string;
  pending: boolean;
  onSubmit: (note: string) => Promise<void>;
}) {
  const t = useTranslations('dockets.returnDialog');
  const [note, setNote] = useState('');
  const trimmed = note.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { number })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!trimmed) return;
            await onSubmit(trimmed);
            setNote('');
          }}
        >
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">{t('note')}</span>
            <Textarea
              dir="auto"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={!trimmed || pending}>
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
