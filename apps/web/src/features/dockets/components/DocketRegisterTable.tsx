import { useTranslations } from 'next-intl';
import type { Docket } from '@/lib/api/endpoints/dockets';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DocketRegisterRow from './DocketRegisterRow';

const COLUMNS = [
  'number',
  'ticket',
  'client',
  'outcome',
  'review',
  'author',
  'stamped',
  'verified',
] as const;

export default function DocketRegisterTable({
  projectKey,
  dockets,
}: {
  projectKey: string;
  dockets: Docket[];
}) {
  const t = useTranslations('dockets.register');
  if (dockets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column}>{t(`columns.${column}`)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dockets.map((docket) => (
            <DocketRegisterRow key={docket.id} projectKey={projectKey} docket={docket} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
