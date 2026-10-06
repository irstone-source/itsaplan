'use client';

import { useTranslations } from 'next-intl';
import TrackerStarterButton from './TrackerStarterButton';

// No measures yet: the instance owner can load the starter set in one go.
export default function TrackerEmpty({ isGod, filtered }: { isGod: boolean; filtered: boolean }) {
  const t = useTranslations('tracker');
  if (filtered)
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('emptyFiltered')}</p>;
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">{t('emptyTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('empty')}</p>
      {isGod && <TrackerStarterButton />}
    </div>
  );
}
