import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function TimeSetupLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="timeSetup">{children}</StandaloneShell>;
}
