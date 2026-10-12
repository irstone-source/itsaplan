import { useTranslations } from 'next-intl';
import type { CycleBillables } from '@/lib/api/endpoints/cycles';
import { formatPence } from '@/utils/money';
import { formatMinutes } from '@/utils/estimate';

// The cycle's value and planned time by revenue: committed clients, new clients,
// running the consultancy, other internal work, and client work with no class set.
export default function CycleBillablesClasses({ byClass }: { byClass: CycleBillables['byClass'] }) {
  const t = useTranslations('cycles.billables');
  const rows = byClass.filter((c) => c.issueCount > 0);
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 text-start font-normal">{t('byClass')}</th>
          <th className="py-1 text-end font-normal">{t('estimated')}</th>
          <th className="py-1 text-end font-normal">{t('value')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const cost =
            (c.revenueClass === 'management' || c.revenueClass === 'internal') && c.valuePence > 0;
          return (
            <tr key={c.revenueClass} className="border-t">
              <td className="py-1.5">
                {t(`classes.${c.revenueClass}`)}{' '}
                <span className="text-muted-foreground">· {c.issueCount}</span>
              </td>
              <td className="py-1.5 text-end text-muted-foreground tabular-nums">
                {formatMinutes(c.estimatedMinutes)}
              </td>
              <td className="py-1.5 text-end font-medium tabular-nums">
                {cost ? '−' : ''}
                {formatPence(c.valuePence)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
