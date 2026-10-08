import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Tag,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DevelopmentLink } from '@/lib/api/endpoints/git';
import { Badge } from '@/components/ui/badge';
import { issueDevelopmentBadgeClassName } from './issueDevelopmentBadgeStyles';

export default function IssueDevelopmentStateBadge({ link }: { link: DevelopmentLink }) {
  const t = useTranslations('issue.development');
  if (link.kind === 'branch')
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} border-border/70 bg-muted/30 text-foreground/80`}
      >
        <GitBranch />
        {t('branch')}
      </Badge>
    );
  if (link.kind === 'release')
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} ${link.state === 'prerelease' ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}
      >
        <Tag />
        {link.state === 'prerelease' ? t('releaseCandidate') : t('released')}
      </Badge>
    );
  if (link.draft)
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} border-border/70 bg-muted/50 text-muted-foreground`}
      >
        <GitPullRequestDraft />
        {t('draft')}
      </Badge>
    );
  if (link.state === 'merged')
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300`}
      >
        <GitMerge />
        {t('merged')}
      </Badge>
    );
  if (link.state === 'closed')
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300`}
      >
        <GitPullRequestClosed />
        {t('closed')}
      </Badge>
    );
  if ((link.checkStatus ?? link.pipelineStatus) === 'success')
    return (
      <Badge
        variant="outline"
        className={`${issueDevelopmentBadgeClassName} border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300`}
      >
        <GitPullRequestArrow />
        {t('ready')}
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className={`${issueDevelopmentBadgeClassName} border-border/70 bg-muted/30 text-foreground/80`}
    >
      <GitPullRequest />
      {t('open')}
    </Badge>
  );
}
