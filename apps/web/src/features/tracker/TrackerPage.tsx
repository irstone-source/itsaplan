'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { getTrackerBoard, type TrackerFilters } from '@/lib/api/endpoints/tracker';
import { qk } from '@/services/queryKeys';
import { Button } from '@/components/ui/button';
import TrackerFiltersBar from './components/TrackerFiltersBar';
import TrackerSummary from './components/TrackerSummary';
import TrackerGroup from './components/TrackerGroup';
import TrackerMeasureDialog from './components/TrackerMeasureDialog';

// The growth tracker: every measure the reader can see, grouped by company, with a
// coloured cell per period and the share of each colour per loop.
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <TrackerFiltersBar
            settings={data.settings}
            companies={companies}
            filters={filters}
            onChange={setFilters}
          />
          {mayCreate && (
            <Button className="ms-auto" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {t('addMeasure')}
            </Button>
          )}
        </div>
        <TrackerSummary summary={data.summary} />
        {data.measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          companies.map((c) => (
            <TrackerGroup
              key={c}
              company={c}
              measures={data.measures.filter((m) => m.company === c)}
              settings={data.settings}
            />
          ))
        )}
        <p className="text-xs text-muted-foreground">
          {t('legend', { green: data.settings.greenPercent, amber: data.settings.amberPercent })}
        </p>
      </div>
      {creating && (
        <TrackerMeasureDialog settings={data.settings} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
