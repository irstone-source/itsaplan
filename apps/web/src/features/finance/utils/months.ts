export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const toPence = (pounds: string) => Math.round(Number(pounds) * 100);
export const toPounds = (pence: number | null) => (pence != null ? String(pence / 100) : '');
