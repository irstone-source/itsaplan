import { useTranslations } from 'next-intl';
import type { TimeBlock } from '@/lib/api/endpoints/timecap';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { targetLabel } from '../utils/day';

// The suggested ticket or initiative with its confidence; the reason on hover.
export default function TimecapSuggestionChip({
  suggestion,
}: {
  suggestion: TimeBlock['suggestion'];
}) {
  const t = useTranslations('timecap.block');
  const target = suggestion && targetLabel(suggestion.issue, suggestion.initiative);
  if (!suggestion || !target) {
    return <span className="text-xs text-muted-foreground">{t('noSuggestion')}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={suggestion.confidence >= 85 ? 'default' : 'outline'}>
          {t('suggestion', { target, confidence: suggestion.confidence })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{suggestion.reason}</TooltipContent>
    </Tooltip>
  );
}
