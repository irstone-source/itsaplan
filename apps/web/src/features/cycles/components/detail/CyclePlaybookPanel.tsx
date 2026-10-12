'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Repeat } from 'lucide-react';
import { addPlaybookToCycle, getCyclePlaybook } from '@/lib/api/endpoints/cycles';
import type { PlaybookItem } from '@/lib/api/endpoints/playbook';
import { qk } from '@/services/queryKeys';
import { usePermissions } from '@/hooks/usePermissions';
import { playbookPath } from '@/utils/paths';
import { formatPence } from '@/utils/money';
import { Button } from '@/components/ui/button';

// The playbook items the cycle's month makes due, to add in one go or one by one.
// Hidden once nothing is due and nothing ad hoc is on offer.
export default function CyclePlaybookPanel({
  cycleId,
  projectKey,
}: {
  cycleId: number;
  projectKey: string;
}) {
  const t = useTranslations('cycles.playbook');
  const tItem = useTranslations('playbook');
  const qc = useQueryClient();
  const { can } = usePermissions();
  const queryKey = [...qk.boardIssues(projectKey), 'playbook', cycleId];
  const { data } = useQuery({ queryKey, queryFn: () => getCyclePlaybook(cycleId) });
  const add = useMutation({
    mutationFn: (itemIds: number[]) => addPlaybookToCycle(cycleId, itemIds),
    onSuccess: (res) => {
      toast.success(t('added', { count: res.created.length }));
      void qc.invalidateQueries({ queryKey: qk.boardIssues(projectKey) });
    },
  });
  if (!data || (data.due.length === 0 && data.adHoc.length === 0)) return null;
  const canAdd = can('cycles', 'edit');

  const chip = (item: PlaybookItem) => (
    <li
      key={item.id}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs"
    >
      <span className="max-w-64 truncate" dir="auto">
        {item.title}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {item.billing === 'non_billable'
          ? tItem('billing.non_billable')
          : formatPence(item.pricePence)}
      </span>
      {canAdd && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-xs"
          disabled={add.isPending}
          onClick={() => add.mutate([item.id])}
        >
          {t('add')}
        </Button>
      )}
    </li>
  );

  return (
    <div className="border-b bg-muted/30 px-6 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Repeat className="size-4 text-muted-foreground" />
        <span className="font-medium">{t('title')}</span>
        <span className="text-xs text-muted-foreground">
          {t('due', { count: data.due.length })}
          {data.added.length > 0 && ` · ${t('inCycle', { count: data.added.length })}`}
        </span>
        {canAdd && data.due.length > 0 && (
          <Button
            size="sm"
            className="h-6 text-xs"
            disabled={add.isPending}
            onClick={() => add.mutate(data.due.map((i) => i.id))}
          >
            {t('addAll')}
          </Button>
        )}
        <Link
          href={playbookPath(projectKey)}
          className="ms-auto text-xs text-muted-foreground hover:underline"
        >
          {t('manage')}
        </Link>
      </div>
      {data.due.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{data.due.map(chip)}</ul>}
      {data.adHoc.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('adHoc')}</span>
          <ul className="flex flex-wrap gap-1.5">{data.adHoc.map(chip)}</ul>
        </div>
      )}
    </div>
  );
}
