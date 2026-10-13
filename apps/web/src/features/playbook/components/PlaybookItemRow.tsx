import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import {
  PLAYBOOK_BILLING,
  PLAYBOOK_CADENCES,
  type PlaybookItem,
  type PlaybookItemInput,
} from '@/lib/api/endpoints/playbook';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPence } from '@/utils/money';
import { formatMinutes } from '@/utils/estimate';
import { hoursToMinutes, poundsToPence } from '../utils/format';
import { useDeletePlaybookItem, useUpdatePlaybookItem } from '../services/playbook.service';

// One item, edited in place: a field saves when it loses focus or its value is
// picked. A reader sees the values instead.
export default function PlaybookItemRow({
  projectKey,
  item,
  canEdit,
}: {
  projectKey: string;
  item: PlaybookItem;
  canEdit: boolean;
}) {
  const t = useTranslations('playbook');
  const update = useUpdatePlaybookItem(projectKey);
  const remove = useDeletePlaybookItem(projectKey);
  const [title, setTitle] = useState(item.title);
  const [measure, setMeasure] = useState(item.measure);
  const [price, setPrice] = useState(String(item.pricePence / 100));
  const [hours, setHours] = useState(
    item.estimateMinutes != null ? String(item.estimateMinutes / 60) : '',
  );
  const save = (patch: PlaybookItemInput) =>
    update.mutate({ id: item.id, patch }, { onSuccess: () => toast.success(t('saved')) });

  const cadence =
    item.cadence === 'quarterly'
      ? `${t('cadence.quarterly')} · ${t('quarterMonth', { month: item.quarterMonth })}`
      : t(`cadence.${item.cadence}`);

  if (!canEdit)
    return (
      <tr className={`border-t ${item.active ? '' : 'text-muted-foreground'}`}>
        <td className="px-4 py-2" dir="auto">
          {item.title}
          {item.measure && (
            <span className="block text-xs text-muted-foreground">{item.measure}</span>
          )}
        </td>
        <td className="px-2 py-2 text-end tabular-nums">{formatPence(item.pricePence)}</td>
        <td className="px-2 py-2">{t(`billing.${item.billing}`)}</td>
        <td className="px-2 py-2">{cadence}</td>
        <td className="px-2 py-2 text-end tabular-nums">
          {item.estimateMinutes != null ? formatMinutes(item.estimateMinutes) : '—'}
        </td>
        <td className="px-2 py-2 text-center text-xs">{item.active ? '' : t('inactive')}</td>
        <td />
      </tr>
    );

  return (
    <tr className={`border-t ${item.active ? '' : 'opacity-60'}`}>
      <td className="px-4 py-1.5">
        <Input
          className="h-8"
          dir="auto"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== item.title && save({ title: title.trim() })}
        />
        <Input
          className="mt-1 h-7 border-dashed text-xs text-muted-foreground"
          dir="auto"
          placeholder={t('fields.measure')}
          value={measure}
          onChange={(e) => setMeasure(e.target.value)}
          onBlur={() => measure !== item.measure && save({ measure: measure.trim() })}
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8 text-end tabular-nums"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => {
            const pence = poundsToPence(price);
            if (pence != null && pence !== item.pricePence) save({ pricePence: pence });
          }}
        />
      </td>
      <td className="px-2 py-1.5">
        <Select
          value={item.billing}
          onValueChange={(v) => save({ billing: v as PlaybookItem['billing'] })}
        >
          <SelectTrigger size="sm" className="w-full">
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
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1.5">
          <Select
            value={item.cadence}
            onValueChange={(v) => save({ cadence: v as PlaybookItem['cadence'] })}
          >
            <SelectTrigger size="sm" className="flex-1">
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
          {item.cadence === 'quarterly' && (
            <Select
              value={String(item.quarterMonth)}
              onValueChange={(v) => save({ quarterMonth: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-28" aria-label={t('fields.quarterMonth')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t('quarterMonthShort', { month: m })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8 text-end tabular-nums"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={() => {
            const minutes = hoursToMinutes(hours);
            if (minutes !== item.estimateMinutes && (minutes != null || hours.trim() === ''))
              save({ estimateMinutes: minutes });
          }}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Switch checked={item.active} onCheckedChange={(active) => save({ active })} />
      </td>
      <td className="pe-2">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          aria-label={t('delete')}
          disabled={remove.isPending}
          onClick={() => remove.mutate(item.id, { onSuccess: () => toast.success(t('deleted')) })}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </td>
    </tr>
  );
}
