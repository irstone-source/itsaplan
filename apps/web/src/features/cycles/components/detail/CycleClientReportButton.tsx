import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { ClipboardCopy } from 'lucide-react';
import { getCycleClientReport } from '@/lib/api/endpoints/cycles';
import { Button } from '@/components/ui/button';

// Copies one client's cycle report (markdown) to the clipboard, to paste to them.
export default function CycleClientReportButton({
  cycleId,
  initiativeId,
}: {
  cycleId: number;
  initiativeId: number;
}) {
  const t = useTranslations('cycles.billables');
  const copy = useMutation({
    mutationFn: () => getCycleClientReport(cycleId, initiativeId),
    onSuccess: async ({ markdown }) => {
      await navigator.clipboard.writeText(markdown);
      toast.success(t('reportCopied'));
    },
  });
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="size-5 text-muted-foreground"
      title={t('copyReport')}
      aria-label={t('copyReport')}
      disabled={copy.isPending}
      onClick={() => copy.mutate()}
    >
      <ClipboardCopy className="size-3" />
    </Button>
  );
}
