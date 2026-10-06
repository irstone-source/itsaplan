'use client';

import { useTranslations } from 'next-intl';
import type { TrackerMeasure } from '@/lib/api/endpoints/tracker';
import TrackerNorthStarTile from './TrackerNorthStarTile';

// The measures every initiative and company steers by, ahead of the detail.
export default function TrackerNorthStars({
  measures,
  canEdit,
}: {
  measures: TrackerMeasure[];
  canEdit: boolean;
}) {
  const t = useTranslations('tracker');
  const stars = measures.filter((m) => m.northStar);
  if (stars.length === 0 && !canEdit) return null;
  return (
    <section aria-labelledby="tracker-north-stars" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="tracker-north-stars" className="text-lg font-semibold tracking-tight">
          {t('northStars')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('northStarsHint')}</p>
      </div>
      {stars.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t('northStarsEmpty')}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stars.map((m) => (
            <TrackerNorthStarTile key={m.id} measure={m} />
          ))}
        </div>
      )}
    </section>
  );
}
