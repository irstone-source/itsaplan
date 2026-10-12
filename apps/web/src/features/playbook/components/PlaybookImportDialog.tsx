import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import {
  importPlaybook,
  type PlaybookImportAction,
  type PlaybookImportRow,
} from '@/lib/api/endpoints/playbook';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { readPlaybookCsv } from '../utils/csv';
import PlaybookImportPlan from './PlaybookImportPlan';

// Loads a CSV of repeatable tasks: reading the file shows what the import would do,
// and Apply writes it.
export default function PlaybookImportDialog({ projectKey }: { projectKey: string }) {
  const t = useTranslations('playbook.import');
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PlaybookImportRow[]>([]);
  const [shifted, setShifted] = useState<string[]>([]);
  const [setup, setSetup] = useState(true);
  const [plan, setPlan] = useState<PlaybookImportAction[] | null>(null);
  const run = useMutation({
    mutationFn: (input: { rows: PlaybookImportRow[]; setup: boolean; apply: boolean }) =>
      importPlaybook(projectKey, input),
  });

  function preview(nextRows: PlaybookImportRow[], nextSetup: boolean) {
    run.mutate(
      { rows: nextRows, setup: nextSetup, apply: false },
      { onSuccess: (res) => setPlan(res.actions) },
    );
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const read = readPlaybookCsv(await file.text());
    setRows(read.rows);
    setShifted(read.shifted);
    preview(read.rows, setup);
  }

  function apply() {
    run.mutate(
      { rows, setup, apply: true },
      {
        onSuccess: (res) => {
          toast.success(t('done', { count: res.actions.filter((a) => a.kind !== 'skip').length }));
          void qc.invalidateQueries({ queryKey: ['playbook', projectKey] });
          void qc.invalidateQueries({ queryKey: ['initiatives'] });
          setOpen(false);
          setPlan(null);
          setRows([]);
        },
      },
    );
  }

  const writes = plan?.filter((a) => a.kind !== 'skip').length ?? 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload />
          {t('open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Label className="flex items-start gap-2 font-normal">
            <Checkbox
              checked={setup}
              onCheckedChange={(v) => {
                setSetup(v === true);
                preview(rows, v === true);
              }}
            />
            <span className="text-sm">{t('setup')}</span>
          </Label>
          {plan && <PlaybookImportPlan actions={plan} shifted={shifted} />}
        </div>
        <DialogFooter>
          <Button onClick={apply} disabled={!plan || writes === 0 || run.isPending}>
            {t('apply', { count: writes })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
