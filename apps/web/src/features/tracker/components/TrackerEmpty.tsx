'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { loadStarterMeasures } from '@/lib/api/endpoints/tracker';
import { Button } from '@/components/ui/button';

// No measures yet: the instance owner can load the starter set in one go.
export default function TrackerEmpty({ isGod, filtered }: { isGod: boolean; filtered: boolean }) {
  const t = useTranslations('tracker');
  const qc = useQueryClient();
  const load = useMutation({
    mutationFn: loadStarterMeasures,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      toast.success(
        t('starterLoaded', { created: res.created.length, skipped: res.skipped.length }),
      );
    },
  });
  if (filtered)
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('emptyFiltered')}</p>;
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">{t('emptyTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('empty')}</p>
      {isGod && (
        <Button disabled={load.isPending} onClick={() => load.mutate()}>
          {t('loadStarter')}
        </Button>
      )}
    </div>
  );
}
