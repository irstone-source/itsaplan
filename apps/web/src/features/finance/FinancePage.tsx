'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFinance } from '@/lib/api/endpoints/finance';
import { qk } from '@/services/queryKeys';
import { Button } from '@/components/ui/button';
import FinanceYearForm from './components/FinanceYearForm';
import FinanceMonths from './components/FinanceMonths';
import { shiftMonth, monthLabel } from './utils/months';

// The owner's revenue plan for a year: the target, how it is spread over the
// cycles, and each month's break-even and pool against the billings done.
export default function FinancePage() {
  const t = useTranslations('finance');
  const [start, setStart] = useState<string | undefined>();
  const { data } = useQuery({ queryKey: qk.finance(start), queryFn: () => getFinance(start) });
  if (!data) return null;
  const last = shiftMonth(data.startMonth, 11);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('previous')}
            onClick={() => setStart(shiftMonth(data.startMonth, -12))}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="min-w-56 text-center text-sm font-medium">
            {monthLabel(data.startMonth)} – {monthLabel(last)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('next')}
            onClick={() => setStart(shiftMonth(data.startMonth, 12))}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        <FinanceYearForm
          key={`${data.startMonth}-${data.revenueTargetPence}-${data.projectId}`}
          data={data}
          onStartChange={setStart}
        />
        <FinanceMonths data={data} />
      </div>
    </div>
  );
}
