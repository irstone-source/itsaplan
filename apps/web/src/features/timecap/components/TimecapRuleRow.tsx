import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Trash2, Users } from 'lucide-react';
import type { TimeRule, TimeRuleField } from '@/lib/api/endpoints/timecap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDeleteRule } from '../services/timecap.service';
import { targetLabel } from '../utils/day';

// A team rule is read-only here: a project owner wrote it.
export default function TimecapRuleRow({ rule }: { rule: TimeRule }) {
  const t = useTranslations('timecap.rules');
  const tCommon = useTranslations('common');
  const remove = useDeleteRule();
  const target = rule.ignore ? t('ignore') : targetLabel(rule.issue, rule.initiative);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {t(`field.${rule.field as TimeRuleField}`)}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="auto">
        {rule.pattern}
      </span>
      <Badge variant={rule.ignore ? 'outline' : 'secondary'}>{target}</Badge>
      <span className="w-14 text-xs text-muted-foreground tabular-nums">
        {t('hits', { count: rule.hits })}
      </span>
      {rule.personal ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={tCommon('delete')}
          disabled={remove.isPending}
          onClick={() => remove.mutate(rule.id, { onSuccess: () => toast.success(t('deleted')) })}
        >
          <Trash2 />
        </Button>
      ) : (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {t('team')}
        </span>
      )}
    </li>
  );
}
