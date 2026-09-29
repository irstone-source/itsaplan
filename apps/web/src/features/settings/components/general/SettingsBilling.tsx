import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import { useUpdateProject } from '@/services/projects.service';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsSection from '@/components/common/page/SettingsSection';
import SettingsRow from '@/components/common/page/SettingsRow';
import { Switch } from '@/components/ui/switch';

// Whether the project's work is for a client (valued at each initiative's day rate)
// or on the company itself (costed at the instance's internal day rate).
export default function SettingsBilling({
  project,
  editable,
}: {
  project: ProjectDetail;
  editable: boolean;
}) {
  const t = useTranslations('settings.general');
  const update = useUpdateProject();

  return (
    <SettingsSection title={t('billing')} description={t('billingHint')}>
      <SettingsCard>
        <SettingsRow
          title={t('internal')}
          description={t('internalHint')}
          control={
            <Switch
              checked={project.project.internal}
              disabled={!editable || update.isPending}
              onCheckedChange={(internal) =>
                update.mutate({ projectKey: project.project.ref, patch: { internal } })
              }
            />
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}
