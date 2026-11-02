import type { TimeState } from '@/lib/api/endpoints/rize';

export const STATE_CLASS: Record<TimeState, string> = {
  none: 'text-muted-foreground',
  ok: 'text-emerald-700 dark:text-emerald-300',
  flag: 'text-amber-600 dark:text-amber-400',
  stop: 'text-red-600 dark:text-red-400',
};

export const STATE_BAR: Record<TimeState, string> = {
  none: 'bg-muted-foreground/40',
  ok: 'bg-emerald-500',
  flag: 'bg-amber-500',
  stop: 'bg-red-500',
};
