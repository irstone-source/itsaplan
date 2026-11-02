import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function MyTimeLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="myTime">{children}</StandaloneShell>;
}
