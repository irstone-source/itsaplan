'use client';

import type { ChangeEvent } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import SettingsRow from '@/components/common/page/SettingsRow';
import ItsAPlanMark from '@/components/brand/ItsAPlanMark';
import { Button } from '@/components/ui/button';

const MAX_LOGO_BYTES = 256 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

// One logo upload: a preview, an upload button and a reset.
export default function GodBrandingLogoRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations('god.branding');

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return void toast.error(t('logoWrongType'));
    if (file.size > MAX_LOGO_BYTES) return void toast.error(t('logoTooLarge'));
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <SettingsRow
      title={title}
      description={description}
      control={
        <div className="flex items-center gap-2">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL preview
            <img src={value} alt="" className="size-9 rounded object-contain" />
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
                onChange={pick}
              />
            </label>
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t('reset')}
            </Button>
          )}
        </div>
      }
    />
  );
}
