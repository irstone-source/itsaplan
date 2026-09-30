import { useTranslations } from 'next-intl';

// The team's progress to break-even, as a share only.
export default function PerformanceProgress({ progress }: { progress: number | null }) {
  const t = useTranslations('performance');
  if (progress == null) {
    return <p className="text-sm text-muted-foreground">{t('noBreakEven')}</p>;
  }
  const percent = Math.round(progress * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('teamProgress')}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${progress >= 1 ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {progress >= 1 ? t('aboveBreakEven') : t('belowBreakEven')}
      </p>
    </div>
  );
}
