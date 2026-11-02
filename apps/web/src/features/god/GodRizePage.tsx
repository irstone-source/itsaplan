'use client';

import { useQuery } from '@tanstack/react-query';
import { getRizeStatus } from '@/lib/api/endpoints/rize';
import GodSettingsGate from './components/GodSettingsGate';
import GodRizeForm from './components/GodRizeForm';

export default function GodRizePage() {
  const query = useQuery({ queryKey: ['rizeStatus'], queryFn: getRizeStatus });
  return (
    <GodSettingsGate slug="rize" data={query.data}>
      {(status) => <GodRizeForm status={status} />}
    </GodSettingsGate>
  );
}
