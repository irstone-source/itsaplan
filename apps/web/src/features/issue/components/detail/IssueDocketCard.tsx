import { useState } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import MarkdownEditor from '@/components/common/editor/MarkdownEditor';
import { Button } from '@/components/ui/button';
import { useRelativeTime } from '@/context/relativeTimeContext';
import { useAttachDocket, useDiscardDocket } from '../../services/dockets.service';

export default function IssueDocketCard({ docket }: { docket: Docket }) {
  const t = useTranslations('issue.dockets');
  const [open, setOpen] = useState(false);
  const attach = useAttachDocket(docket.issueId);
  const discard = useDiscardDocket(docket.issueId);
  const busy = attach.isPending || discard.isPending;
  const relative = useRelativeTime();

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{t('waiting')}</span>
        <span className="text-xs text-muted-foreground">{relative(docket.createdAt)}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t('hide') : t('show')}
        </Button>
      </div>
      <div className={open ? 'mt-2' : 'mt-2 max-h-24 overflow-hidden'}>
        <MarkdownEditor
          className="text-sm text-foreground/90"
          defaultValue={docket.body}
          editable={false}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            await attach.mutateAsync(docket.id);
            toast.success(t('attached'));
          }}
        >
          {t('attach')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            await discard.mutateAsync(docket.id);
            toast.success(t('discarded'));
          }}
        >
          {t('discard')}
        </Button>
      </div>
    </div>
  );
}
