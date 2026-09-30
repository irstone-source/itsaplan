'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import PerformanceMine from './components/PerformanceMine';
import PerformanceTeam from './components/PerformanceTeam';

const currentMonth = () => new Date().toISOString().slice(0, 7);

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

// The monthly performance share: everyone sees their own figures; the instance
// owner also sees and sets the team's.
export default function PerformancePage() {
  const t = useTranslations('performance');
  const { data: session } = useSession();
  // The session can be filled before hydration; reading the role after mount keeps
  // the server and client render the same.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isGod = mounted && session?.user.role === 'god';
  const [month, setMonth] = useState(currentMonth);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('previous')}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{label}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('next')}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        <PerformanceMine month={month} />
        {isGod && <PerformanceTeam month={month} />}
      </div>
    </div>
  );
}
