'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getBranding, updateBranding, type Branding } from '@/lib/api/endpoints/branding';
import { qk } from '@/services/queryKeys';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodSectionPage from './components/GodSectionPage';
import GodSettingsGate from './components/GodSettingsGate';
import GodBrandingLogoRow from './components/GodBrandingLogoRow';

const DEFAULT_ACCENT = '#171717';

export default function GodBrandingPage() {
  const query = useQuery({ queryKey: qk.branding, queryFn: getBranding });
  return (
    <GodSettingsGate slug="branding" data={query.data}>
      {(branding) => <BrandingForm branding={branding} />}
    </GodSettingsGate>
  );
}

function BrandingForm({ branding }: { branding: Branding }) {
  const t = useTranslations('god.branding');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Branding>(branding);
  const save = useMutation({
    mutationFn: updateBranding,
    onSuccess: (data) => qc.setQueryData(qk.branding, data),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(branding);

  async function submit() {
    try {
      await save.mutateAsync(draft);
      toast.success(t('saved'));
      // The layout reads the branding on the server; a refresh re-renders it.
      router.refresh();
    } catch {
      // The failure already surfaced through the global mutation error toast.
    }
  }

  return (
    <GodSectionPage slug="branding">
      <SettingsSection title={t('identity')}>
        <SettingsCard>
          <SettingsRow
            title={t('appName')}
            description={t('appNameHint')}
            control={
              <Input
                value={draft.appName ?? ''}
                maxLength={40}
                placeholder="It's a Plan"
                className="w-56"
                onChange={(e) => setDraft({ ...draft, appName: e.target.value || null })}
              />
            }
          />
          <SettingsRow
            title={t('accentColor')}
            description={t('accentColorHint')}
            control={
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t('accentColor')}
                  value={draft.accentColor ?? DEFAULT_ACCENT}
                  className="h-8 w-12 cursor-pointer rounded border bg-transparent"
                  onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })}
                />
                {draft.accentColor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft({ ...draft, accentColor: null })}
                  >
                    {t('reset')}
                  </Button>
                )}
              </div>
            }
          />
          <GodBrandingLogoRow
            title={t('logo')}
            description={t('logoHint')}
            value={draft.logo}
            onChange={(logo) => setDraft({ ...draft, logo })}
          />
          <GodBrandingLogoRow
            title={t('logoLight')}
            description={t('logoLightHint')}
            value={draft.logoLight}
            onChange={(logoLight) => setDraft({ ...draft, logoLight })}
          />
        </SettingsCard>
      </SettingsSection>
      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={!dirty || save.isPending}>
          {save.isPending ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>
    </GodSectionPage>
  );
}
