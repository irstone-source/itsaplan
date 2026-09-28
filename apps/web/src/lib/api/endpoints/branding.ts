import { request } from '@/lib/api/core/client';

export interface Branding {
  appName: string | null;
  accentColor: string | null;
  logo: string | null;
}

export const getBranding = () => request<Branding>('/settings/branding');

export const updateBranding = (branding: Branding) =>
  request<Branding>('/god/branding', { method: 'PUT', body: JSON.stringify(branding) });
