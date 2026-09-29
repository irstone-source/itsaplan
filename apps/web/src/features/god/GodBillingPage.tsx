'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  getBillingSettings,
  updateBillingSettings,
  type BillingSettings,
} from '@/lib/api/endpoints/settings';
import { qk } from '@/services/queryKeys';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodSectionPage from './components/GodSectionPage';
import GodSettingsGate from './components/GodSettingsGate';

export default function GodBillingPage() {
  const query = useQuery({ queryKey: qk.billingSettings, queryFn: getBillingSettings });
  return (
    <GodSettingsGate slug="billing" data={query.data}>
      {(settings) => <BillingForm settings={settings} />}
    </GodSettingsGate>
  );
}

function BillingForm({ settings }: { settings: BillingSettings }) {
  const t = useTranslations('god.billing');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const [hours, setHours] = useState(String(settings.hoursPerDay));
  const [pounds, setPounds] = useState(
    settings.internalDayRatePence != null ? String(settings.internalDayRatePence / 100) : '',
  );
  const save = useMutation({
    mutationFn: updateBillingSettings,
    onSuccess: (data) => {
      qc.setQueryData(qk.billingSettings, data);
      // Every cycle's totals are computed with these rates.
      void qc.invalidateQueries({ queryKey: ['boardIssues'] });
    },
  });

  const hoursPerDay = Number(hours);
  const internalDayRatePence = pounds.trim() === '' ? null : Math.round(Number(pounds) * 100);
  const valid =
    hoursPerDay >= 1 &&
    hoursPerDay <= 24 &&
    (internalDayRatePence == null ||
      (Number.isFinite(internalDayRatePence) && internalDayRatePence >= 0));
  const dirty =
    hoursPerDay !== settings.hoursPerDay || internalDayRatePence !== settings.internalDayRatePence;

  async function submit() {
    try {
      await save.mutateAsync({ hoursPerDay, internalDayRatePence });
      toast.success(t('saved'));
    } catch {
      // The failure already surfaced through the global mutation error toast.
    }
  }

  return (
    <GodSectionPage slug="billing">
      <SettingsSection title={t('rates')} description={t('ratesHint')}>
        <SettingsCard className="divide-y divide-border/60">
          <SettingsRow
            title={t('hoursPerDay')}
            description={t('hoursPerDayHint')}
            control={
              <Input
                inputMode="decimal"
                className="w-24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            }
          />
          <SettingsRow
            title={t('internalDayRate')}
            description={t('internalDayRateHint')}
            control={
              <Input
                inputMode="decimal"
                className="w-32"
                placeholder="£"
                value={pounds}
                onChange={(e) => setPounds(e.target.value)}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={!valid || !dirty || save.isPending}>
          {save.isPending ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>
    </GodSectionPage>
  );
}
