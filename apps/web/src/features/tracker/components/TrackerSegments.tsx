'use client';

// A row of choices where one, or none ("all"), is picked.
export default function TrackerSegments({
  label,
  all,
  options,
  value,
  onChange,
}: {
  label: string;
  all: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const item = (key: string | undefined, text: string) => {
    const active = value === key;
    return (
      <button
        key={key ?? ''}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(key)}
        className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
          active
            ? 'bg-background font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {text}
      </button>
    );
  };
  return (
    <div
      role="group"
      aria-label={label}
      className="flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5"
    >
      {item(undefined, all)}
      {options.map((o) => item(o, o))}
    </div>
  );
}
