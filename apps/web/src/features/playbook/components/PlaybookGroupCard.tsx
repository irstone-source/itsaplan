import { useTranslations } from 'next-intl';
import type { PlaybookGroup } from '@/lib/api/endpoints/playbook';
import { Badge } from '@/components/ui/badge';
import { formatPence } from '@/utils/money';
import { CLASS_BADGE } from '../utils/format';
import PlaybookHoursBand from './PlaybookHoursBand';
import PlaybookItemRow from './PlaybookItemRow';

// One client: its revenue class, what its items are priced at per month against
// the retainer fee, and the items.
export default function PlaybookGroupCard({
  projectKey,
  group,
  canEdit,
}: {
  projectKey: string;
  group: PlaybookGroup;
  canEdit: boolean;
}) {
  const t = useTranslations('playbook');
  const fee = group.monthlyFeePence;
  const gap = fee != null ? fee - group.monthlyPricedPence : null;
  const fill = fee ? Math.min(100, (group.monthlyPricedPence / fee) * 100) : null;

  return (
    <section className="rounded-lg border">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <h2 className="text-base font-medium" dir="auto">
          {group.title}
        </h2>
        {group.revenueClass && (
          <Badge variant="outline" className={CLASS_BADGE[group.revenueClass]}>
            {t(`classes.${group.revenueClass as 'committed' | 'new' | 'management'}`)}
          </Badge>
        )}
        <div className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
          {fill != null && (
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${gap != null && gap < 0 ? 'bg-amber-500' : 'bg-primary'}`}
                style={{ width: `${fill}%` }}
              />
            </span>
          )}
          <span className="tabular-nums">
            {fee != null
              ? t('pricedOfFee', {
                  priced: formatPence(group.monthlyPricedPence),
                  fee: formatPence(fee),
                })
              : t('priced', { priced: formatPence(group.monthlyPricedPence) })}
          </span>
          {gap != null && gap !== 0 && (
            <span className={gap < 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
              {gap < 0
                ? t('overFee', { amount: formatPence(-gap) })
                : t('underFee', { amount: formatPence(gap) })}
            </span>
          )}
        </div>
      </header>
      <PlaybookHoursBand group={group} />
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-start font-normal">{t('fields.title')}</th>
            <th className="w-28 px-2 py-2 text-end font-normal">{t('fields.price')}</th>
            <th className="w-36 px-2 py-2 text-start font-normal">{t('fields.billing')}</th>
            <th className="w-64 px-2 py-2 text-start font-normal">{t('fields.cadence')}</th>
            <th className="w-24 px-2 py-2 text-end font-normal">{t('fields.estimate')}</th>
            <th className="w-20 px-2 py-2 text-center font-normal">{t('fields.active')}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {group.items.map((item) => (
            <PlaybookItemRow key={item.id} projectKey={projectKey} item={item} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
