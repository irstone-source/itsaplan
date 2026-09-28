'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getBranding, updateBranding, type Branding } from '@/lib/api/endpoints/branding';
import { qk } from '@/services/queryKeys';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import ItsAPlanMark from '@/components/brand/ItsAPlanMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodSectionPage from './components/GodSectionPage';
import GodSettingsGate from './components/GodSettingsGate';

const MAX_LOGO_BYTES = 256 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
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

  function pickLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return void toast.error(t('logoWrongType'));
    if (file.size > MAX_LOGO_BYTES) return void toast.error(t('logoTooLarge'));
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => ({ ...d, logo: String(reader.result) }));
    reader.readAsDataURL(file);
  }

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
          <SettingsRow
            title={t('logo')}
            description={t('logoHint')}
            control={
              <div className="flex items-center gap-2">
                {draft.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data URL preview
                  <img src={draft.logo} alt="" className="size-9 rounded object-contain" />
                ) : (
                  <ItsAPlanMark className="size-9" />
                )}
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    {t('upload')}
                    <input
                      type="file"
                      accept={LOGO_TYPES.join(',')}
                      className="sr-only"
                      onChange={pickLogo}
                    />
                  </label>
                </Button>
                {draft.logo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft({ ...draft, logo: null })}
                  >
                    {t('reset')}
                  </Button>
                )}
              </div>
            }
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
