import { useTranslations } from 'next-intl';
import type { PerformanceTicket } from '@/lib/api/endpoints/performance';
import { formatPence } from '@/utils/money';

// The completed tickets a person's billings are made of.
export default function PerformanceTickets({ tickets }: { tickets: PerformanceTicket[] }) {
  const t = useTranslations('performance');
  if (tickets.length === 0)
    return <p className="text-sm text-muted-foreground">{t('noTickets')}</p>;
  return (
    <ul className="divide-y text-sm">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="flex gap-3 py-1.5">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{ticket.identifier}</span>
          <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
          <span className="shrink-0 tabular-nums">{formatPence(ticket.valuePence)}</span>
        </li>
      ))}
    </ul>
  );
}
