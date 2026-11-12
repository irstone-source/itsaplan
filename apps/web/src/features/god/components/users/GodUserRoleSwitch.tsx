'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { InstanceUser } from '@/lib/api/endpoints/god';
import { useSession } from '@/lib/auth-client';
import ConfirmDialog from '@/components/common/overlay/ConfirmDialog';
import { Switch } from '@/components/ui/switch';
import { useInstanceOwnerQuery, useSetInstanceUserRole } from '../../services/god.service';

// God mode for another account, which only the instance owner gives or takes. For
// everyone else, and for an account whose role cannot change, the role badge beside
// it already shows the state.
export default function GodUserRoleSwitch({ user }: { user: InstanceUser }) {
  const t = useTranslations('god.users');
  const { data: session } = useSession();
  const { data: owner } = useInstanceOwnerQuery();
  const setRole = useSetInstanceUserRole();
  const [confirming, setConfirming] = useState(false);
  const viewer = session?.user.id;
  if (!viewer || owner?.userId !== viewer) return null;
  if (user.id === viewer || user.isAgent || !user.active) return null;
  const isGod = user.role === 'god';
  const apply = (role: 'god' | 'user') =>
    setRole
      .mutateAsync({ userId: user.id, role })
      .then(() =>
        toast.success(t(role === 'god' ? 'godGiven' : 'godTaken', { email: user.email })),
      );

  return (
    <>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Switch
          checked={isGod}
          disabled={setRole.isPending}
          aria-label={t('godAria', { email: user.email })}
          onCheckedChange={(on) => (on ? setConfirming(true) : void apply('user'))}
        />
        {t('godMode')}
      </label>
      {confirming && (
        <ConfirmDialog
          title={t('giveGodTitle', { email: user.email })}
          confirmLabel={t('giveGodConfirm')}
          onConfirm={async () => {
            await apply('god');
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        >
          <p className="text-sm text-muted-foreground">{t('giveGodBody')}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
