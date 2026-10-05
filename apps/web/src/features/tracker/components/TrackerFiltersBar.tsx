'use client';

import { useTranslations } from 'next-intl';
import type { TrackerBoard, TrackerFilters } from '@/lib/api/endpoints/tracker';

const SELECT = 'h-8 rounded-md border bg-transparent px-2 text-sm';

export default function TrackerFiltersBar({
  settings,
  companies,
  filters,
  onChange,
}: {
  settings: TrackerBoard['settings'];
  companies: string[];
  filters: TrackerFilters;
  onChange: (f: TrackerFilters) => void;
}) {
  const t = useTranslations('tracker');
  const allCompanies = [...new Set([...settings.companies, ...companies])];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t('company')}
        className={SELECT}
        value={filters.company ?? ''}
        onChange={(e) => onChange({ ...filters, company: e.target.value || undefined })}
      >
        <option value="">{t('allCompanies')}</option>
        {allCompanies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        aria-label={t('loop')}
        className={SELECT}
        value={filters.loop ?? ''}
        onChange={(e) => onChange({ ...filters, loop: e.target.value || undefined })}
      >
        <option value="">{t('allLoops')}</option>
        {settings.loops.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
