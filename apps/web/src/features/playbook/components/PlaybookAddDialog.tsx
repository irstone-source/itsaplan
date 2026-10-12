import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import {
  PLAYBOOK_BILLING,
  PLAYBOOK_CADENCES,
  type PlaybookBilling,
  type PlaybookCadence,
} from '@/lib/api/endpoints/playbook';
import { useInitiativeOptionsQuery } from '@/services/initiatives.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hoursToMinutes, poundsToPence } from '../utils/format';
import { useCreatePlaybookItem } from '../services/playbook.service';

export default function PlaybookAddDialog({ projectKey }: { projectKey: string }) {
  const t = useTranslations('playbook');
  const [open, setOpen] = useState(false);
  const [initiativeId, setInitiativeId] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const [billing, setBilling] = useState<PlaybookBilling>('billable');
  const [cadence, setCadence] = useState<PlaybookCadence>('monthly');
  const { data: initiatives } = useInitiativeOptionsQuery(open ? projectKey : null);
  const create = useCreatePlaybookItem(projectKey);
  const valid = initiativeId !== '' && title.trim() !== '';

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        initiativeId: Number(initiativeId),
        title: title.trim(),
        pricePence: poundsToPence(price) ?? 0,
        estimateMinutes: hoursToMinutes(hours),
        billing,
        cadence,
      },
      {
        onSuccess: () => {
          toast.success(t('created'));
          setTitle('');
          setPrice('');
          setHours('');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          {t('add')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('client')}</Label>
            {initiatives?.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noInitiatives')}</p>
            ) : (
              <Select value={initiativeId} onValueChange={setInitiativeId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {initiatives?.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="playbook-title">{t('fields.title')}</Label>
            <Input
              id="playbook-title"
              dir="auto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playbook-price">{t('fields.price')}</Label>
            <Input
              id="playbook-price"
              inputMode="decimal"
              placeholder="250"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playbook-hours">{t('fields.estimate')}</Label>
            <Input
              id="playbook-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fields.billing')}</Label>
            <Select value={billing} onValueChange={(v) => setBilling(v as PlaybookBilling)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBOOK_BILLING.map((b) => (
                  <SelectItem key={b} value={b}>
                    {t(`billing.${b}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('fields.cadence')}</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v as PlaybookCadence)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBOOK_CADENCES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`cadence.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!valid || create.isPending}>
            {t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
