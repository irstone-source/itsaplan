import { useTranslations } from 'next-intl';
import { Lock, Phone } from 'lucide-react';
import type { TimeBlock } from '@/lib/api/endpoints/timecap';
import { formatTime } from '@/utils/dates';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatSeconds, targetLabel } from '../utils/day';
import TimecapSuggestionChip from './TimecapSuggestionChip';
import TimecapBlockActions from './TimecapBlockActions';

export default function TimecapBlockRow({ block }: { block: TimeBlock }) {
  const t = useTranslations('timecap');
  const allocated = targetLabel(block.issue, block.initiative);
  const subtitle = [block.domain, block.app, block.device].filter(Boolean).join(' · ');

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm',
        block.status === 'ignored' && 'text-muted-foreground',
      )}
    >
      <span className="w-28 shrink-0 tabular-nums" dir="ltr">
        {formatTime(block.startedAt)}–{formatTime(block.endedAt)}
      </span>
      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
        {formatSeconds(block.seconds)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {block.source === 'call' && (
            <Phone className="size-3.5 shrink-0" aria-label={t('block.call')} />
          )}
          <span className="truncate" dir="auto">
            {block.title}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground" dir="auto">
          {subtitle}
        </span>
      </span>
      {block.status === 'confirmed' ? (
        <Badge variant="secondary">{allocated ?? t('block.noTarget')}</Badge>
      ) : block.status === 'ignored' ? (
        <Badge variant="outline">{t('block.status.ignored')}</Badge>
      ) : (
        <TimecapSuggestionChip suggestion={block.suggestion} />
      )}
      {block.locked ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {t('my.locked')}
        </span>
      ) : (
        <TimecapBlockActions block={block} />
      )}
    </li>
  );
}
