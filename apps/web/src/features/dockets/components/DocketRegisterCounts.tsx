import { useTranslations } from 'next-intl';
import type { DocketRegister } from '@/lib/api/endpoints/dockets';

export default function DocketRegisterCounts({ counts }: { counts: DocketRegister['counts'] }) {
  const t = useTranslations('dockets.register');
  const tiles = [
    { key: 'delivered', value: counts.approved, tone: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'pendingReview', value: counts.pending, tone: '' },
    { key: 'blocked', value: counts.blocked, tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'returned', value: counts.returned, tone: 'text-destructive-text' },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.key} className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t(tile.key)}</p>
          <p className={`text-2xl font-semibold tabular-nums ${tile.tone}`}>{tile.value}</p>
        </div>
      ))}
    </div>
  );
}
