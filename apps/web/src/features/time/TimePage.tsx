'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useShellRoute } from '@/hooks/useShellRoute';
import SectionPageView from '@/components/common/page/SectionPageView';
import { formatMinutes } from '@/utils/estimate';
import { Input } from '@/components/ui/input';
import TimeClients from './components/TimeClients';
import TimeClientMap from './components/TimeClientMap';
import TimeUnmatched from './components/TimeUnmatched';
import { useTimeOverview } from './services/time.service';

// A month of time tracked in Rize: each client against its limit, the Rize clients
// mapped to initiatives, and the time not yet tied to a ticket.
export default function TimePage() {
  const t = useTranslations('time');
  const { projectKey } = useShellRoute();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data } = useTimeOverview(projectKey, month);

  return (
    <SectionPageView
      title={t('title')}
      description={t('description')}
      actions={
        <Input
          type="month"
          className="w-40"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
      }
    >
      {data && projectKey && (
        <div className="space-y-8">
          <p className="text-sm text-muted-foreground tabular-nums">
            {t('summary', {
              tracked: formatMinutes(data.trackedMinutes),
              matched: formatMinutes(data.matchedMinutes),
              loose: formatMinutes(data.trackedMinutes - data.matchedMinutes),
            })}
          </p>
          <TimeClients clients={data.clients} />
          <TimeClientMap projectKey={projectKey} rizeClients={data.rizeClients} />
          <TimeUnmatched projectKey={projectKey} entries={data.unmatched} />
        </div>
      )}
    </SectionPageView>
  );
}
