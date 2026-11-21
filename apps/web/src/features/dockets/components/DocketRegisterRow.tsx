import Link from 'next/link';
import type { Docket } from '@/lib/api/endpoints/dockets';
import DocketOutcomeBadge from '@/components/common/dockets/DocketOutcomeBadge';
import DocketReviewBadge from '@/components/common/dockets/DocketReviewBadge';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatUkDateTime } from '@/utils/docketTime';
import { docketPath, issuePath, parseIssueIdentifier } from '@/utils/paths';
import DocketRegisterCheck from './DocketRegisterCheck';

export default function DocketRegisterRow({
  projectKey,
  docket,
}: {
  projectKey: string;
  docket: Docket;
}) {
  const seq = parseIssueIdentifier(docket.issue.identifier)?.sequenceNumber;
  return (
    <TableRow>
      <TableCell className="font-mono font-medium" dir="ltr">
        <Link href={docketPath(docket.id)} className="hover:underline">
          {docket.number}
        </Link>
      </TableCell>
      <TableCell className="max-w-72 truncate">
        {seq != null ? (
          <Link href={issuePath(projectKey, seq)} className="hover:underline">
            <span className="font-mono text-muted-foreground" dir="ltr">
              {docket.issue.identifier}
            </span>{' '}
            <span dir="auto">{docket.issue.title}</span>
          </Link>
        ) : (
          docket.issue.identifier
        )}
      </TableCell>
      <TableCell dir="auto">{docket.client?.name ?? '—'}</TableCell>
      <TableCell>{docket.outcome && <DocketOutcomeBadge outcome={docket.outcome} />}</TableCell>
      <TableCell>
        <DocketReviewBadge status={docket.reviewStatus} />
      </TableCell>
      <TableCell>{docket.author?.name ?? '—'}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {docket.stampedAt && formatUkDateTime(docket.stampedAt)}
      </TableCell>
      <TableCell>
        <DocketRegisterCheck docketId={docket.id} />
      </TableCell>
    </TableRow>
  );
}
