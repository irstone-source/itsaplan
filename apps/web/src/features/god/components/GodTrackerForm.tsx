'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  updateTrackerSettings,
  type TrackerKind,
  type TrackerSettings,
} from '@/lib/api/endpoints/tracker';
import { qk } from '@/services/queryKeys';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import GodSectionPage from './GodSectionPage';

const KINDS: TrackerKind[] = ['activity', 'engagement', 'outcome', 'guardrail', 'gate'];

// The growth tracker's rules: colour thresholds, streaks, when a period closes, the
// loops and companies measures are grouped by, and who may set targets.
export default function GodTrackerForm({ settings }: { settings: TrackerSettings }) {
  const t = useTranslations('god.tracker');
  const tKind = useTranslations('tracker.kind');
  const tTracker = useTranslations('tracker');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TrackerSettings>(settings);
  const [loops, setLoops] = useState(settings.loops.join('\n'));
  const [companies, setCompanies] = useState(settings.companies.join('\n'));
  const save = useMutation({
    mutationFn: updateTrackerSettings,
    onSuccess: (data) => {
      qc.setQueryData(qk.trackerSettings, data);
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      toast.success(t('saved'));
    },
  });
  const lines = (s: string) =>
    s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  const next = { ...draft, loops: lines(loops), companies: lines(companies) };
  const valid = next.amberPercent <= next.greenPercent && next.loops.length > 0;

  const number = (key: keyof TrackerSettings, title: string, hint: string) => (
    <SettingsRow
      title={title}
      description={hint}
      control={
        <Input
          inputMode="numeric"
          className="w-24"
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) || 0 })}
        />
      }
    />
  );

  return (
    <GodSectionPage slug="tracker">
      <SettingsSection title={t('colours')} description={t('coloursHint')}>
        <SettingsCard className="divide-y divide-border/60">
          {number('greenPercent', t('greenPercent'), t('greenPercentHint'))}
          {number('amberPercent', t('amberPercent'), t('amberPercentHint'))}
          {number('smallNumberBelow', t('smallNumberBelow'), t('smallNumberBelowHint'))}
          {number('rollingPeriods', t('rollingPeriods'), t('rollingPeriodsHint'))}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t('streaks')} description={t('streaksHint')}>
        <SettingsCard className="divide-y divide-border/60">
          {KINDS.map((k) => (
            <SettingsRow
              key={k}
              title={tKind(k)}
              description={tTracker('streak')}
              control={
                <Input
                  inputMode="numeric"
                  className="w-24"
                  value={String(draft.streaks[k])}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      streaks: { ...draft.streaks, [k]: Number(e.target.value) || 1 },
                    })
                  }
                />
              }
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t('periods')} description={t('periodsHint')}>
        <SettingsCard className="divide-y divide-border/60">
          {number('closeAfterHours', t('closeAfterHours'), t('closeAfterHoursHint'))}
          {number('historyPeriods', t('historyPeriods'), t('historyPeriodsHint'))}
          {number('escalateAfterDays', t('escalateAfterDays'), t('escalateAfterDaysHint'))}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t('structure')} description={t('structureHint')}>
        <SettingsCard className="divide-y divide-border/60">
          <SettingsRow
            title={t('loops')}
            description={t('loopsHint')}
            control={
              <Textarea
                rows={3}
                className="w-56"
                value={loops}
                onChange={(e) => setLoops(e.target.value)}
              />
            }
          />
          <SettingsRow
            title={t('companies')}
            description={t('companiesHint')}
            control={
              <Textarea
                rows={5}
                className="w-56"
                value={companies}
                onChange={(e) => setCompanies(e.target.value)}
              />
            }
          />
          {number('maxMeasuresPerInitiative', t('maxMeasures'), t('maxMeasuresHint'))}
          <SettingsRow
            title={t('targetSetters')}
            description={t('targetSettersHint')}
            control={
              <select
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={draft.targetSetters}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    targetSetters: e.target.value as TrackerSettings['targetSetters'],
                  })
                }
              >
                <option value="owner_only">{t('ownerOnly')}</option>
                <option value="measure_owner">{t('measureOwner')}</option>
              </select>
            }
          />
        </SettingsCard>
      </SettingsSection>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate(next)} disabled={!valid || save.isPending}>
          {save.isPending ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>
    </GodSectionPage>
  );
}
