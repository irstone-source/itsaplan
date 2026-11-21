import { useTranslations } from 'next-intl';
import type { DocketOutcome } from '@/lib/api/endpoints/dockets';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE: Record<DocketOutcome, string> = {
  complete:
    'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  blocked: 'border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

export default function DocketOutcomeBadge({
  outcome,
  className,
}: {
  outcome: DocketOutcome;
  className?: string;
}) {
  const t = useTranslations('dockets.outcome');
  return (
    <Badge variant="outline" className={cn(TONE[outcome], className)}>
      {t(outcome)}
    </Badge>
  );
}
