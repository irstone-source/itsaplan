import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TimecapSetupStep({
  number,
  title,
  body,
  check,
  done,
  children,
}: {
  number: number;
  title: string;
  body: string;
  check: string;
  done: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('timecap.setup');
  return (
    <section className="flex gap-3 rounded-md border px-4 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          {done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
          {done ? t('done') : t('waiting')} · {check}
        </p>
      </div>
    </section>
  );
}
