import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="tracker">{children}</StandaloneShell>;
}
