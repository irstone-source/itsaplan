// The rules the Rize sync matches and judges time by, kept free of the database so
// they can be read and tested on their own.

// The issue identifiers ("CON-14") in a Rize task or entry title, in the order they
// appear. The task name is read before the entry title, so a task named after its
// ticket wins over an id mentioned in passing.
export function issueRefs(...texts: (string | null | undefined)[]) {
  const refs: { key: string; sequenceNumber: number }[] = [];
  for (const text of texts) {
    for (const m of (text ?? '').matchAll(/\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g))
      refs.push({ key: m[1]!, sequenceNumber: Number(m[2]) });
  }
  return refs;
}

export type TimeState = 'none' | 'ok' | 'flag' | 'stop';

// Where a client's tracked time stands against its monthly limit: a red flag at 60%
// of the limit, down tools at 70%. No limit set, no judgement.
export const FLAG_SHARE = 0.6;
export const STOP_SHARE = 0.7;

export function timeState(trackedMinutes: number, limitMinutes: number | null): TimeState {
  if (!limitMinutes) return 'none';
  const share = trackedMinutes / limitMinutes;
  if (share >= STOP_SHARE) return 'stop';
  if (share >= FLAG_SHARE) return 'flag';
  return 'ok';
}
