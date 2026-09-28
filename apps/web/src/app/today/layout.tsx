import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

export default function TodayLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="today">{children}</StandaloneShell>;
}
