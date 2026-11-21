import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import { cn } from '@/lib/utils';

export default function DocketPageEvidence({ docket }: { docket: Docket }) {
  const t = useTranslations('dockets');
  if (!docket.evidence) return null;
  const blocked = docket.outcome === 'blocked';
  return (
    <section className="break-inside-avoid space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {blocked ? t('blocker') : t('evidence')}
      </h2>
      <blockquote
        dir="auto"
        className={cn(
          'border-s-4 bg-muted/40 py-2 ps-4 pe-3 text-sm whitespace-pre-wrap',
          blocked ? 'border-amber-500' : 'border-emerald-600',
        )}
      >
        {docket.evidence}
      </blockquote>
    </section>
  );
}
