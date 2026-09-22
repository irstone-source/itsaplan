import { Badge } from '@/components/ui/badge';

// A single label as a colored-dot pill.
export function LabelBadge({ color, name }: { color: string; name: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </Badge>
  );
}
