import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { searchIssues } from '@/lib/api/endpoints/issues';
import type { TimeIssueRef } from '@/lib/api/endpoints/timecap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { splitProjectRef } from '@/utils/paths';

// Finds a ticket of the chosen project by number or title; the chosen one shows as a
// row with a clear button.
export default function TimecapTicketPicker({
  projectKey,
  value,
  onChange,
}: {
  projectKey: string;
  value: TimeIssueRef | null;
  onChange: (issue: TimeIssueRef | null) => void;
}) {
  const t = useTranslations('timecap.change');
  const [q, setQ] = useState('');
  const { data: hits } = useQuery({
    queryKey: ['timecap', 'issueSearch', projectKey, q],
    queryFn: () => searchIssues(projectKey, { q, limit: 8 }),
    enabled: q.trim().length > 0,
  });

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{value.identifier}</span>
        <span className="min-w-0 flex-1 truncate" dir="auto">
          {value.title}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('noTicket')}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        placeholder={t('searchTicket')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {hits && hits.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full gap-2 px-2 py-1 text-start text-sm hover:bg-muted"
                onClick={() => {
                  onChange({
                    id: h.id,
                    identifier: h.identifier,
                    title: h.title,
                    projectKey: splitProjectRef(projectKey).key,
                  });
                  setQ('');
                }}
              >
                <span className="shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                  {h.identifier}
                </span>
                <span className="truncate" dir="auto">
                  {h.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
