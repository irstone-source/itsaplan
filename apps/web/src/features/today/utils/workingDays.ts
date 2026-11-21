// The weekdays strictly between the day of `since` and the day of `now`, in local time.
export function workingDaysBetween(since: Date, now: Date): number {
  const day = new Date(since.getFullYear(), since.getMonth(), since.getDate() + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let count = 0;
  while (day < end) {
    if (day.getDay() !== 0 && day.getDay() !== 6) count++;
    day.setDate(day.getDate() + 1);
  }
  return count;
}
