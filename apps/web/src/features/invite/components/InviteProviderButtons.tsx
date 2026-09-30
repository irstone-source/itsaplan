'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import GoogleIcon from '@/components/common/GoogleIcon';
import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { useAuthConfig } from '@/services/authConfig.service';
import { signInWithProviderForInvite } from '../services/invite.service';

// Single sign-on for the invitee: Google and the instance's own identity provider,
// whichever are configured. Renders nothing when neither is.
export default function InviteProviderButtons({ token }: { token: string }) {
  const t = useTranslations('invite');
  const tLogin = useTranslations('auth.login');
  const authConfig = useAuthConfig();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!authConfig?.google && !authConfig?.oidc) return null;

  async function go(provider: 'google' | 'oidc') {
    setError(null);
    setPending(true);
    try {
      await signInWithProviderForInvite(token, provider);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('genericError'));
      setPending(false);
    }
  }

  return (
    <Field className="gap-2">
      {authConfig.google && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => go('google')}>
          <GoogleIcon className="size-4" />
          {tLogin('withGoogle')}
        </Button>
      )}
      {authConfig.oidc && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => go('oidc')}>
          <ShieldCheck />
          {authConfig.oidcLabel || tLogin('withSso')}
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
