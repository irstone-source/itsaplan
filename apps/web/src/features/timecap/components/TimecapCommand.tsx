import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

// One shell command with a copy button.
export default function TimecapCommand({ command }: { command: string }) {
  const t = useTranslations('timecap.setup');
  const tCommon = useTranslations('common');

  async function copy() {
    await navigator.clipboard.writeText(command);
    toast.success(t('copied'));
  }

  return (
    <div className="flex w-full items-center gap-2" dir="ltr">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
        {command}
      </code>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={tCommon('copy')}
        onClick={() => void copy()}
      >
        <Copy />
      </Button>
    </div>
  );
}
