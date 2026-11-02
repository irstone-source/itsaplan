import { useInitiativeOptionsQuery } from '@/services/initiatives.service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The project's initiatives, with a "none" row. `include` keeps a chosen initiative
// in the list when its status would otherwise leave it out.
export default function TimecapInitiativeSelect({
  projectKey,
  value,
  noneLabel,
  onChange,
}: {
  projectKey: string | null;
  value: number | null;
  noneLabel: string;
  onChange: (id: number | null) => void;
}) {
  const { data: initiatives } = useInitiativeOptionsQuery(projectKey, {
    include: value ?? undefined,
  });
  return (
    <Select
      value={value != null ? String(value) : 'none'}
      onValueChange={(v) => onChange(v === 'none' ? null : Number(v))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{noneLabel}</SelectItem>
        {initiatives?.map((i) => (
          <SelectItem key={i.id} value={String(i.id)}>
            {i.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
