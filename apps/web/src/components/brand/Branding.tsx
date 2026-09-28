'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { APP_NAME } from '@/utils/app';
import type { Branding } from '@/lib/api/endpoints/branding';
import ItsAPlanMark from './ItsAPlanMark';

const BrandingContext = createContext<Branding>({ appName: null, accentColor: null, logo: null });

// The instance branding, read once by the root layout on the server and handed to
// every client component below it.
export function BrandingProvider({
  branding,
  children,
}: {
  branding: Branding;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

export function useAppName(): string {
  return useBranding().appName ?? APP_NAME;
}

// The instance logo when one is set, otherwise the built-in mark.
export function BrandMark({ className }: { className?: string }) {
  const { logo } = useBranding();
  if (!logo) return <ItsAPlanMark className={className} />;
  // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
  return <img src={logo} alt="" aria-hidden className={`object-contain ${className ?? ''}`} />;
}

export function BrandName() {
  return <>{useAppName()}</>;
}
