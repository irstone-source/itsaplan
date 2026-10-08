import Link from 'next/link';
import { ExternalLink, Tag } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { GitRelease } from '@/lib/api/endpoints/git';
import { Badge } from '@/components/ui/badge';
import { issuePath, parseIssueIdentifier } from '@/utils/paths';

export default function ReleaseCard({
  projectKey,
  release,
}: {
  projectKey: string;
  release: GitRelease;
}) {
  const t = useTranslations('releases');
  const format = useFormatter();

  return (
    <article className="rounded-md border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag className="size-3.5" />
            <span className="truncate" dir="ltr">
              {release.repository} {release.tag}
            </span>
          </div>
          <h2 className="mt-1 truncate text-base font-medium" dir="auto">
            {release.name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {release.publishedAt
              ? format.dateTime(new Date(release.publishedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : t('unpublished')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className={
              release.prerelease
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }
          >
            {release.prerelease ? t('candidate') : t('released')}
          </Badge>
          {release.url && (
            <a
              href={release.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              {t('viewOnGithub')}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        {t('shipped', { count: release.issues.length })}
      </p>
      {release.issues.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {release.issues.map((issue) => {
            const parsed = parseIssueIdentifier(issue.identifier);
            return (
              <li key={issue.id} className="flex gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                  {issue.identifier}
                </span>
                {parsed ? (
                  <Link
                    href={issuePath(projectKey, parsed.sequenceNumber)}
                    className="truncate hover:underline"
                    dir="auto"
                  >
                    {issue.title}
                  </Link>
                ) : (
                  <span className="truncate" dir="auto">
                    {issue.title}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
