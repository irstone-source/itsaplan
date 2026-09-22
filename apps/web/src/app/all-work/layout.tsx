import type { ReactNode } from 'react';
import AllWorkShell from '@/components/layout/AllWorkShell';

// All Work lives outside the project shell: it reads every project the caller can
// access, so no single project is loaded and the project sidebar does not apply.
export default function AllWorkLayout({ children }: { children: ReactNode }) {
  return <AllWorkShell>{children}</AllWorkShell>;
}
