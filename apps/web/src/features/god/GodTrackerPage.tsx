'use client';

import { useQuery } from '@tanstack/react-query';
import { getTrackerSettings } from '@/lib/api/endpoints/tracker';
import { qk } from '@/services/queryKeys';
import GodSettingsGate from './components/GodSettingsGate';
import GodTrackerForm from './components/GodTrackerForm';

export default function GodTrackerPage() {
  const query = useQuery({ queryKey: qk.trackerSettings, queryFn: getTrackerSettings });
  return (
    <GodSettingsGate slug="tracker" data={query.data}>
      {(settings) => <GodTrackerForm settings={settings} />}
    </GodSettingsGate>
  );
}
