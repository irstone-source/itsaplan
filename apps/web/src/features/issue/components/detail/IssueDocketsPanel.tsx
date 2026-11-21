import { useIssueDocketsQuery } from '../../services/dockets.service';
import IssueDocketCard from './IssueDocketCard';
import IssueStampedDocketRow from './IssueStampedDocketRow';

// The issue's stamped dockets, and for people who can edit the issue the agent drafts
// waiting to be attached or discarded. The api returns drafts only to editors.
export default function IssueDocketsPanel({
  issueId,
  projectKey,
  canEdit,
}: {
  issueId: number;
  projectKey: string;
  canEdit: boolean;
}) {
  const dockets = useIssueDocketsQuery(issueId).data ?? [];
  const drafts = canEdit ? dockets.filter((d) => d.status === 'draft') : [];
  const stamped = dockets.filter((d) => d.stampedAt != null);
  if (drafts.length === 0 && stamped.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {stamped.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {stamped.map((docket) => (
            <IssueStampedDocketRow key={docket.id} docket={docket} projectKey={projectKey} />
          ))}
        </ul>
      )}
      {drafts.map((docket) => (
        <IssueDocketCard key={docket.id} docket={docket} />
      ))}
    </div>
  );
}
