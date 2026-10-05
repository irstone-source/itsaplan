'use client';

import type { LucideIcon } from 'lucide-react';

const TONE = {
  focus: 'bg-[#e5484d]/12 text-[#c62a2f] dark:text-[#ff8589]',
  hole: 'bg-black text-white dark:ring-1 dark:ring-white/25',
  check: 'bg-[#f0ac1f]/18 text-[#8a5a00] dark:text-[#f5c451]',
  quiet: 'bg-muted text-muted-foreground',
} as const;

// A short state a row is in: a focus meeting due, a missing figure, one to check.
export default function TrackerStatusChip({
  tone,
  icon: Icon,
  label,
}: {
  tone: keyof typeof TONE;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONE[tone]}`}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
