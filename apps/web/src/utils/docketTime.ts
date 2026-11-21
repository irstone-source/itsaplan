// Dockets are stamped for UK clients, so their times read in Europe/London and en-GB
// whatever the viewer's own zone and language.
const UK_ZONE = 'Europe/London';

const ukFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
});

export function formatUkDateTime(iso: string): string {
  return ukFormat.format(new Date(iso));
}

// A session that starts and ends on the same day prints the date once.
export function formatUkRange(startIso: string, endIso: string): string {
  return ukFormat.formatRange(new Date(startIso), new Date(endIso));
}

export function formatUtcDateTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

// YYYY-MM of the current month in the UK.
export function ukMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: UK_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}
