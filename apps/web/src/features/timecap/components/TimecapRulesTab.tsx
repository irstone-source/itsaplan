import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { useTimeRulesQuery } from '../services/timecap.service';
import TimecapRuleRow from './TimecapRuleRow';

export default function TimecapRulesTab() {
  const t = useTranslations('timecap.rules');
  const { data: rules, isPending } = useTimeRulesQuery();

  if (isPending || !rules) return <Skeleton className="h-24 w-full" />;

  return (
    <section className="space-y-2">
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      {rules.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rules.map((rule) => (
            <TimecapRuleRow key={rule.id} rule={rule} />
          ))}
        </ul>
      )}
      {rules.some((r) => !r.personal) && (
        <p className="text-xs text-muted-foreground">{t('teamHint')}</p>
      )}
    </section>
  );
}
