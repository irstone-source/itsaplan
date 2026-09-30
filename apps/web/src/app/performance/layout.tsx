import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function PerformanceLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="performance">{children}</StandaloneShell>;
}
