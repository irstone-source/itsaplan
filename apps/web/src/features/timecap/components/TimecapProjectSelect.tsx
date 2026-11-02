import { useProjectsQuery } from '@/services/projects.service';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Every project the viewer can read, by ref.
export default function TimecapProjectSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (ref: string) => void;
}) {
  const { data: projects } = useProjectsQuery();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projects?.map((p) => (
          <SelectItem key={p.ref} value={p.ref}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
