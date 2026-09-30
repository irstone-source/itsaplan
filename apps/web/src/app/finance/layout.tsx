import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="finance">{children}</StandaloneShell>;
}
