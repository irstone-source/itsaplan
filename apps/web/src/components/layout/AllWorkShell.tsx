'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { LocaleToggle } from '@/components/locale-toggle';
import UserMenu from '@/components/layout/UserMenu';

// The shell for All Work: a slim header with no project loaded. The back link goes
// to the root redirector, which lands on the last-used project.
export default function AllWorkShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
        <Button asChild variant="ghost" size="icon" className="size-7">
          <Link href="/" aria-label={t('backToProject')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <Separator orientation="vertical" className="me-1 h-4" />
        <div className="min-w-0 truncate text-sm font-medium">{t('allWork')}</div>
        <div className="ms-auto flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
