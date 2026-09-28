import { cache } from 'react';
import type { Branding } from '@/lib/api/endpoints/branding';
import { serverRuntimeEnv } from '@/utils/runtimeEnv';

const DEFAULT_BRANDING: Branding = { appName: null, accentColor: null, logo: null };

// Read once per request. An unreachable API renders the built-in brand rather than
// failing the page.
export const loadBranding = cache(async (): Promise<Branding> => {
  try {
    const res = await fetch(`${serverRuntimeEnv().apiUrl}/settings/branding`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok ? { ...DEFAULT_BRANDING, ...(await res.json()) } : DEFAULT_BRANDING;
  } catch {
    return DEFAULT_BRANDING;
  }
});

// CSS that puts the accent colour on the primary tokens, with a text colour that
// stays readable on it. Null when there is no valid colour to apply.
export function accentCss(color: string | null): string | null {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const foreground = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#ffffff';
  return (
    `:root,.dark{--primary:${color};--primary-foreground:${foreground};--ring:${color};` +
    `--sidebar-primary:${color};--sidebar-primary-foreground:${foreground}}`
  );
}
