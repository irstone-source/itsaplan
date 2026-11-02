import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useFormatter, useTranslations } from 'next-intl';
import { setRizeKey, syncRize, type RizeStatus } from '@/lib/api/endpoints/rize';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GodSectionPage from './GodSectionPage';

// The Rize connection: the key is written, never shown back; the sync runs every 15
// minutes on its own, and "Sync now" reads the last 60 days.
export default function GodRizeForm({ status }: { status: RizeStatus }) {
  const t = useTranslations('god.rize');
  const format = useFormatter();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const refresh = (data: RizeStatus) => qc.setQueryData(['rizeStatus'], data);
  const save = useMutation({
    mutationFn: () => setRizeKey(key),
    onSuccess: (data) => {
      refresh(data);
      setKey('');
      toast.success(t('saved'));
    },
  });
  const sync = useMutation({
    mutationFn: syncRize,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['rizeStatus'] });
      void qc.invalidateQueries({ queryKey: ['time'] });
      toast.success(t('synced', { synced: res.synced, matched: res.matched }));
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['rizeStatus'] }),
  });

  return (
    <GodSectionPage slug="rize">
      <SettingsSection title={t('connection')} description={t('connectionHint')}>
        <SettingsCard className="divide-y divide-border/60">
          <SettingsRow
            title={t('key')}
            description={status.configured ? t('keySet') : t('keyMissing')}
            control={
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  className="w-64"
                  placeholder={status.configured ? '••••••••' : ''}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <Button onClick={() => save.mutate()} disabled={!key.trim() || save.isPending}>
                  {t('save')}
                </Button>
              </div>
            }
          />
          <SettingsRow
            title={t('sync')}
            description={
              status.lastSyncAt
                ? t('lastSync', {
                    when: format.dateTime(new Date(status.lastSyncAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                    entries: status.entries,
                  })
                : t('neverSynced')
            }
            control={
              <Button
                variant="outline"
                onClick={() => sync.mutate()}
                disabled={!status.configured || sync.isPending}
              >
                {t('syncNow')}
              </Button>
            }
          />
        </SettingsCard>
        {status.lastError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {t('error', { error: status.lastError })}
          </p>
        )}
      </SettingsSection>
    </GodSectionPage>
  );
}
