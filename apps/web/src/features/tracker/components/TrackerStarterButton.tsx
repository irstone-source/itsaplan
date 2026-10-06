'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { loadStarterMeasures } from '@/lib/api/endpoints/tracker';
import { Button } from '@/components/ui/button';

// Loads the starter set. Measures already tracked under the same company and name are
// skipped, so pressing it again adds only what is missing.
export default function TrackerStarterButton({
  variant = 'default',
}: {
  variant?: 'default' | 'outline';
}) {
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
  return (
    <Button size="sm" variant={variant} disabled={load.isPending} onClick={() => load.mutate()}>
      {t('loadStarter')}
    </Button>
  );
}
