'use client';

// One labelled figure in the billables strip.

export default function CycleBillablesStat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-semibold' : 'font-medium'}`}>
        {value}
      </span>
    </span>
  );
}
