import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { searchIssues } from '@/lib/api/endpoints/issues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLinkTimeEntry } from '../services/time.service';

// Finds a ticket by number or title and ties the time entry to it.
export default function TimeLinkPicker({
  projectKey,
  entryId,
}: {
  projectKey: string;
  entryId: number;
}) {
  const t = useTranslations('time');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: hits } = useQuery({
    queryKey: ['time', projectKey, 'search', q],
    queryFn: () => searchIssues(projectKey, { q, limit: 8 }),
    enabled: open && q.trim().length > 0,
  });
  const link = useLinkTimeEntry(projectKey);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Link2 />
          {t('link')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2">
        <Input
          autoFocus
          placeholder={t('searchTicket')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="space-y-0.5">
          {hits?.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full gap-2 rounded px-2 py-1 text-start text-sm hover:bg-muted"
                disabled={link.isPending}
                onClick={() =>
                  link.mutate(
                    { entryId, issueId: h.id },
                    {
                      onSuccess: () => {
                        toast.success(t('linked', { ticket: h.identifier }));
                        setOpen(false);
                      },
                    },
                  )
                }
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
      </PopoverContent>
    </Popover>
  );
}
