import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useInitiativeOptionsQuery } from '@/services/initiatives.service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMapRizeClient } from '../services/time.service';

// Which client initiative each Rize client's time counts toward.
export default function TimeClientMap({
  projectKey,
  rizeClients,
}: {
  projectKey: string;
  rizeClients: { name: string; initiativeId: number | null }[];
}) {
  const t = useTranslations('time');
  const { data: initiatives } = useInitiativeOptionsQuery(projectKey);
  const map = useMapRizeClient(projectKey);
  if (rizeClients.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{t('mapTitle')}</h2>
      <p className="text-xs text-muted-foreground">{t('mapHint')}</p>
      <ul className="divide-y rounded-md border">
        {rizeClients.map((c) => (
          <li key={c.name} className="flex items-center gap-4 px-4 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate" dir="auto">
              {c.name}
            </span>
            <Select
              value={c.initiativeId != null ? String(c.initiativeId) : 'none'}
              onValueChange={(v) =>
                map.mutate(
                  { rizeClient: c.name, initiativeId: v === 'none' ? null : Number(v) },
                  { onSuccess: () => toast.success(t('mapped')) },
                )
              }
            >
              <SelectTrigger size="sm" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('unmapped')}</SelectItem>
                {initiatives?.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </section>
  );
}
