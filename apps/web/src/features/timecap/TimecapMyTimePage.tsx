'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TimecapDayPicker from './components/TimecapDayPicker';
import TimecapDayView from './components/TimecapDayView';
import TimecapRulesTab from './components/TimecapRulesTab';
import { yesterdayLondon } from './utils/day';

type Tab = 'blocks' | 'rules';

// The viewer's captured blocks for one day, opening on yesterday, and their rules.
export default function TimecapMyTimePage() {
  const t = useTranslations('timecap.my');
  const [date, setDate] = useState(yesterdayLondon);
  const [tab, setTab] = useState<Tab>('blocks');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList variant="line">
              <TabsTrigger value="blocks">{t('tabs.blocks')}</TabsTrigger>
              <TabsTrigger value="rules">{t('tabs.rules')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {tab === 'blocks' ? (
          <>
            <TimecapDayPicker date={date} onChange={setDate} />
            <TimecapDayView date={date} />
          </>
        ) : (
          <TimecapRulesTab />
        )}
      </div>
    </div>
  );
}
