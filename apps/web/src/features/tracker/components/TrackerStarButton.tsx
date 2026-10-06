'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { updateMeasure, type TrackerMeasure } from '@/lib/api/endpoints/tracker';

// The North Star marker beside a measure's name. A target setter toggles it; anyone
// else sees it only where it is set.
export default function TrackerStarButton({ measure: m }: { measure: TrackerMeasure }) {
  const t = useTranslations('tracker');
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => updateMeasure(m.id, { northStar: !m.northStar }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      toast.success(t(m.northStar ? 'northStarRemoved' : 'northStarSet', { name: m.name }));
    },
  });
  const star = (
    <Star
      className={`size-4 ${m.northStar ? 'fill-primary text-primary' : 'text-muted-foreground/50'}`}
    />
  );
  if (!m.canEdit)
    return m.northStar ? (
      <span title={t('northStar')} className="mt-0.5 shrink-0">
        {star}
      </span>
    ) : (
      <span className="size-4 shrink-0" />
    );
  return (
    <button
      type="button"
      aria-pressed={m.northStar}
      aria-label={t(m.northStar ? 'removeNorthStar' : 'makeNorthStar')}
      title={t(m.northStar ? 'removeNorthStar' : 'makeNorthStar')}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate()}
      className={`mt-0.5 shrink-0 rounded transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${m.northStar ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
    >
      {star}
    </button>
  );
}
