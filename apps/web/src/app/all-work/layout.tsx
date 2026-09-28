import type { ReactNode } from 'react';
import StandaloneShell from '@/components/layout/StandaloneShell';

// All Work lives outside the project shell: it reads every project the caller can
// access, so no single project is loaded and the project sidebar does not apply.
export default function AllWorkLayout({ children }: { children: ReactNode }) {
  return <StandaloneShell title="allWork">{children}</StandaloneShell>;
}
