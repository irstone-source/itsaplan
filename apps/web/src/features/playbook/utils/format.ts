export const CLASS_BADGE: Record<string, string> = {
  committed: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  new: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  management: 'border-border bg-muted text-muted-foreground',
};

// Pounds typed into a field as pence, or null when blank or not a number.
export function poundsToPence(value: string): number | null {
  if (value.trim() === '') return null;
  const pence = Math.round(Number(value) * 100);
  return Number.isFinite(pence) && pence >= 0 ? pence : null;
}

// Hours typed into a field as minutes, or null when blank or not a number.
export function hoursToMinutes(value: string): number | null {
  if (value.trim() === '') return null;
  const minutes = Math.round(Number(value) * 60);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}
