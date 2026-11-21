import { useTranslations } from 'next-intl';
import type { DocketRegisterParams } from '@/lib/api/endpoints/dockets';
import { useInitiativeOptionsQuery } from '@/services/initiatives.service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type DocketRegisterFilter = Omit<DocketRegisterParams, 'month'>;

const ALL = 'all';

export default function DocketRegisterFilters({
  projectKey,
  value,
  onChange,
}: {
  projectKey: string;
  value: DocketRegisterFilter;
  onChange: (value: DocketRegisterFilter) => void;
}) {
  const t = useTranslations('dockets');
  const { data: initiatives } = useInitiativeOptionsQuery(projectKey);
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={value.initiativeId ? String(value.initiativeId) : ALL}
        onValueChange={(v) =>
          onChange({ ...value, initiativeId: v === ALL ? undefined : Number(v) })
        }
      >
        <SelectTrigger size="sm" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('register.allClients')}</SelectItem>
          {initiatives?.map((i) => (
            <SelectItem key={i.id} value={String(i.id)}>
              {i.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.outcome ?? ALL}
        onValueChange={(v) =>
          onChange({ ...value, outcome: v === ALL ? undefined : (v as 'complete' | 'blocked') })
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('register.anyOutcome')}</SelectItem>
          <SelectItem value="complete">{t('outcome.complete')}</SelectItem>
          <SelectItem value="blocked">{t('outcome.blocked')}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={value.review ?? ALL}
        onValueChange={(v) =>
          onChange({
            ...value,
            review: v === ALL ? undefined : (v as 'pending' | 'approved' | 'returned'),
          })
        }
      >
        <SelectTrigger size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('register.anyReview')}</SelectItem>
          <SelectItem value="pending">{t('review.pending')}</SelectItem>
          <SelectItem value="approved">{t('review.approved')}</SelectItem>
          <SelectItem value="returned">{t('review.returned')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
