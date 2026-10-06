'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { getTrackerBoard, type TrackerFilters } from '@/lib/api/endpoints/tracker';
import { qk } from '@/services/queryKeys';
import { Button } from '@/components/ui/button';
import TrackerSegments from './components/TrackerSegments';
import TrackerPulse from './components/TrackerPulse';
import TrackerGroup from './components/TrackerGroup';
import TrackerEmpty from './components/TrackerEmpty';
import TrackerMeasureDialog from './components/TrackerMeasureDialog';
import TrackerStarterButton from './components/TrackerStarterButton';
import TrackerNorthStars from './components/TrackerNorthStars';

// The growth tracker: every measure the reader can see, grouped by company, under the
// weekly pulse of the whole board.
export default function TrackerPage() {
  const t = useTranslations('tracker');
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [filters, setFilters] = useState<TrackerFilters>({});
  const [creating, setCreating] = useState(false);
  const { data } = useQuery({
    queryKey: qk.tracker(filters),
    queryFn: () => getTrackerBoard(filters),
  });
  if (!data) return null;

  const isGod = mounted && session?.user.role === 'god';
  const mayCreate = isGod || data.settings.targetSetters === 'measure_owner';
  const companies = [...new Set(data.measures.map((m) => m.company))];
  const allCompanies = [...new Set([...data.settings.companies, ...companies])];
  const filtered = !!(filters.company || filters.loop);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <TrackerSegments
            label={t('company')}
            all={t('allCompanies')}
            options={allCompanies}
            value={filters.company}
            onChange={(company) => setFilters({ ...filters, company })}
          />
          <TrackerSegments
            label={t('loop')}
            all={t('allLoops')}
            options={data.settings.loops}
            value={filters.loop}
            onChange={(loop) => setFilters({ ...filters, loop })}
          />
          <div className="ms-auto flex gap-2">
            {isGod && data.measures.length > 0 && <TrackerStarterButton variant="outline" />}
            {mayCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus />
                {t('addMeasure')}
              </Button>
            )}
          </div>
        </div>

        {data.measures.length === 0 ? (
          <TrackerEmpty isGod={isGod} filtered={filtered} />
        ) : (
          <>
            <TrackerPulse board={data} />
            <TrackerNorthStars measures={data.measures} canEdit={mayCreate} />
            {companies.map((c) => (
              <TrackerGroup
                key={c}
                company={c}
                measures={data.measures.filter((m) => m.company === c)}
                settings={data.settings}
              />
            ))}
            <p className="max-w-3xl text-xs text-muted-foreground">
              {t('legend', {
                green: data.settings.greenPercent,
                amber: data.settings.amberPercent,
              })}
            </p>
          </>
        )}
      </div>
      {creating && (
        <TrackerMeasureDialog settings={data.settings} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
