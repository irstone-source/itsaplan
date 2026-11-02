import { useTranslations, useFormatter } from 'next-intl';
import type { UnmatchedEntry } from '@/lib/api/endpoints/rize';
import { formatMinutes } from '@/utils/estimate';
import TimeLinkPicker from './TimeLinkPicker';

// Tracked time not tied to a ticket, largest first, each with a picker to tie it.
export default function TimeUnmatched({
  projectKey,
  entries,
}: {
  projectKey: string;
  entries: UnmatchedEntry[];
}) {
  const t = useTranslations('time');
  const format = useFormatter();
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{t('unmatchedTitle', { count: entries.length })}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('allMatched')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm"
            >
              <span className="w-16 tabular-nums">{formatMinutes(e.minutes)}</span>
              <span className="min-w-0 flex-1" dir="auto">
                <span className="block truncate">{e.taskName || e.title || t('untitled')}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[e.clientName ?? t('noClient'), e.projectName, e.memberEmail]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  · {format.dateTime(new Date(e.startedAt), { dateStyle: 'medium' })}
                </span>
              </span>
              <TimeLinkPicker projectKey={projectKey} entryId={e.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
