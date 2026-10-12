import { useTranslations } from 'next-intl';
import type { PlaybookImportAction } from '@/lib/api/endpoints/playbook';

// What an import will do (or did), one line per action, the skipped ones last.
export default function PlaybookImportPlan({
  actions,
  shifted,
}: {
  actions: PlaybookImportAction[];
  shifted: string[];
}) {
  const t = useTranslations('playbook.import');
  const writes = actions.filter((a) => a.kind !== 'skip');
  const skips = actions.filter((a) => a.kind === 'skip');
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border p-3 text-xs">
      <p className="font-medium">{t('willDo', { count: writes.length })}</p>
      {writes.length > 0 && (
        <ul className="space-y-0.5">
          {writes.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-16 shrink-0 text-muted-foreground">{t(`kinds.${a.kind}`)}</span>
              <span dir="auto">{a.text}</span>
            </li>
          ))}
        </ul>
      )}
      {(skips.length > 0 || shifted.length > 0) && (
        <>
          <p className="font-medium text-muted-foreground">
            {t('skipped', { count: skips.length + shifted.length })}
          </p>
          <ul className="space-y-0.5 text-muted-foreground">
            {skips.map((a, i) => (
              <li key={i} dir="auto">
                {a.text}
              </li>
            ))}
            {shifted.map((line, i) => (
              <li key={`s${i}`} className="text-amber-600 dark:text-amber-400" dir="auto">
                {t('shifted', { line })}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
