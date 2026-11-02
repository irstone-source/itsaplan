import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { shiftDay, todayLondon, yesterdayLondon } from '../utils/day';

export default function TimecapDayPicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const t = useTranslations('timecap.my');
  const atToday = date >= todayLondon();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t('previousDay')}
        onClick={() => onChange(shiftDay(date, -1))}
      >
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <Input
        type="date"
        className="w-40"
        value={date}
        max={todayLondon()}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t('nextDay')}
        disabled={atToday}
        onClick={() => onChange(shiftDay(date, 1))}
      >
        <ChevronRight className="rtl:rotate-180" />
      </Button>
      {date !== yesterdayLondon() && (
        <Button variant="ghost" size="sm" onClick={() => onChange(yesterdayLondon())}>
          {t('yesterday')}
        </Button>
      )}
    </div>
  );
}
