import { useIssueDocketsQuery } from '../../services/dockets.service';
import IssueDocketCard from './IssueDocketCard';

// Agent run dockets waiting for a person to attach or discard them. Only people who can
// edit the issue read them.
export default function IssueDocketsPanel({
  issueId,
  canEdit,
}: {
  issueId: number;
  canEdit: boolean;
}) {
  const drafts = (useIssueDocketsQuery(issueId, canEdit).data ?? []).filter(
    (d) => d.status === 'draft',
  );
  if (!canEdit || drafts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {drafts.map((docket) => (
        <IssueDocketCard key={docket.id} docket={docket} />
      ))}
    </div>
  );
}
