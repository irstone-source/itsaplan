import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Hourglass, X } from 'lucide-react';
import { getMyTimeStatus } from '@/lib/api/endpoints/timecap';
import { timeSetupPath } from '@/utils/paths';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'today.timecapBannerDismissedUntil';
const DISMISS_MS = 7 * 86_400_000;

// Shown while no computer has sent time in the last 24 hours. A dismissal is kept in
// localStorage for 7 days, read in an effect because the component server-renders.
export default function TodaySetupBanner() {
  const t = useTranslations('timecap.banner');
  const [dismissed, setDismissed] = useState(true);
  const { data: status } = useQuery({
    queryKey: ['timecap', 'status'],
    queryFn: ({ signal }) => getMyTimeStatus(signal),
  });

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
      setDismissed(until > Date.now());
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      // Storage unavailable: the banner returns on the next load.
    }
  }

  if (dismissed || !status || status.active) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border px-4 py-3 text-sm">
      <Hourglass className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t('title')}</p>
        <p className="text-muted-foreground">{t('body')}</p>
        <div className="flex gap-2 pt-1">
          <Button asChild size="sm">
            <Link href={timeSetupPath()}>{t('title')}</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t('dismiss')}
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="icon-xs" aria-label={t('dismiss')} onClick={dismiss}>
        <X />
      </Button>
    </div>
  );
}
