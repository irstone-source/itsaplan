'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  archiveMeasure,
  createMeasure,
  updateMeasure,
  type MeasureInput,
  type TrackerBoard,
  type TrackerMeasure,
} from '@/lib/api/endpoints/tracker';
import { listProjects } from '@/lib/api/endpoints/projects';
import { listInitiativeOptions } from '@/lib/api/endpoints/initiatives';
import { listMembers } from '@/lib/api/endpoints/members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import TrackerRuleFields from './TrackerRuleFields';

const SELECT = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm';
const KINDS = ['activity', 'engagement', 'outcome', 'guardrail', 'gate'] as const;
const UNITS = ['count', 'money', 'percent', 'done'] as const;
const SOURCES = ['manual', 'billings', 'tickets_completed'] as const;

function initial(m: TrackerMeasure | undefined, settings: TrackerBoard['settings']): MeasureInput {
  if (m) {
    const {
      id: _id,
      projectKey: _k,
      initiativeTitle: _i,
      ownerName: _o,
      targetHistory: _h,
      canEnter: _e,
      canEdit: _c,
      cells: _cells,
      ...rest
    } = m;
    return rest;
  }
  return {
    projectId: 0,
    initiativeId: null,
    company: settings.companies[0] ?? '',
    loop: settings.loops[0] ?? '',
    name: '',
    definition: '',
    kind: 'outcome',
    unit: 'count',
    direction: 'at_least',
    cadence: 'week',
    unlockPeriods: 0,
    source: 'manual',
    ownerUserId: null,
    startsOn: new Date().toISOString().slice(0, 10),
    rule: { type: 'fixed', value: 0 },
  };
}

// Creates or changes a measure. A changed target needs a reason, and applies from the
// current period on.
export default function TrackerMeasureDialog({
  settings,
  measure,
  onClose,
}: {
  settings: TrackerBoard['settings'];
  measure?: TrackerMeasure;
  onClose: () => void;
}) {
  const t = useTranslations('tracker');
  const qc = useQueryClient();
  const [form, setForm] = useState<MeasureInput>(() => initial(measure, settings));
  const [reason, setReason] = useState('');
  const set = <K extends keyof MeasureInput>(k: K, v: MeasureInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const projectKey = projects.data?.find((p) => p.id === form.projectId)?.ref;
  const initiatives = useQuery({
    queryKey: ['initiativeOptions', projectKey],
    queryFn: () => listInitiativeOptions(projectKey!, {}),
    enabled: !!projectKey,
  });
  const members = useQuery({
    queryKey: ['trackerMembers', projectKey],
    queryFn: () => listMembers(projectKey!, { page: 1, pageSize: 100, kind: 'human' }),
    enabled: !!projectKey,
  });

  const ruleChanged = !!measure && JSON.stringify(form.rule) !== JSON.stringify(measure.rule);
  const valid =
    form.projectId > 0 &&
    form.name.trim() &&
    form.definition.trim() &&
    form.company.trim() &&
    (!ruleChanged || reason.trim());

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['tracker'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      if (!measure) return createMeasure(form);
      const { rule, ...rest } = form;
      return updateMeasure(measure.id, ruleChanged ? { ...rest, rule, reason } : rest);
    },
    onSuccess: () => {
      toast.success(t('measureSaved'));
      done();
    },
  });
  const archive = useMutation({
    mutationFn: () => archiveMeasure(measure!.id),
    onSuccess: () => {
      toast.success(t('measureArchived'));
      done();
    },
  });

  const field = (label: string, control: React.ReactNode) => (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {control}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{measure ? t('editMeasure') : t('addMeasure')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field(
            t('name'),
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />,
          )}
          {field(
            t('company'),
            <Input
              list="tracker-companies"
              value={form.company}
              onChange={(e) => set('company', e.target.value)}
            />,
          )}
          <datalist id="tracker-companies">
            {settings.companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="sm:col-span-2">
            {field(
              t('definition'),
              <Textarea
                rows={3}
                placeholder={t('definitionHint')}
                value={form.definition}
                onChange={(e) => set('definition', e.target.value)}
              />,
            )}
          </div>
          {field(
            t('project'),
            <select
              className={SELECT}
              value={form.projectId || ''}
              disabled={!!measure}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  projectId: Number(e.target.value),
                  initiativeId: null,
                  ownerUserId: null,
                }))
              }
            >
              <option value="">—</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('initiative'),
            <select
              className={SELECT}
              value={form.initiativeId ?? ''}
              onChange={(e) => set('initiativeId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('wholeProject')}</option>
              {initiatives.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('loop'),
            <select
              className={SELECT}
              value={form.loop}
              onChange={(e) => set('loop', e.target.value)}
            >
              {settings.loops.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('owner'),
            <select
              className={SELECT}
              value={form.ownerUserId ?? ''}
              onChange={(e) => set('ownerUserId', e.target.value || null)}
            >
              <option value="">—</option>
              {members.data?.items.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('kindLabel'),
            <select
              className={SELECT}
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as MeasureInput['kind'])}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('unitLabel'),
            <select
              className={SELECT}
              value={form.unit}
              onChange={(e) => set('unit', e.target.value as MeasureInput['unit'])}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`unit.${u}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('directionLabel'),
            <select
              className={SELECT}
              value={form.direction}
              onChange={(e) => set('direction', e.target.value as MeasureInput['direction'])}
            >
              <option value="at_least">{t('atLeast')}</option>
              <option value="at_most">{t('atMost')}</option>
            </select>,
          )}
          {field(
            t('cadenceLabel'),
            <select
              className={SELECT}
              value={form.cadence}
              disabled={!!measure}
              onChange={(e) => set('cadence', e.target.value as MeasureInput['cadence'])}
            >
              <option value="week">{t('weekly')}</option>
              <option value="month">{t('monthly')}</option>
            </select>,
          )}
          {field(
            t('sourceLabel'),
            <select
              className={SELECT}
              value={form.source}
              onChange={(e) => set('source', e.target.value as MeasureInput['source'])}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`source.${s}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            t('startsOn'),
            <Input
              type="date"
              value={form.startsOn}
              disabled={!!measure}
              onChange={(e) => set('startsOn', e.target.value)}
            />,
          )}
          {field(
            t('unlockPeriods'),
            <Input
              inputMode="numeric"
              value={String(form.unlockPeriods)}
              onChange={(e) => set('unlockPeriods', Math.max(0, Number(e.target.value) || 0))}
            />,
          )}
          <div className="rounded-md border p-3 sm:col-span-2">
            {form.unit === 'done' ? (
              <p className="text-xs text-muted-foreground">{t('doneHint')}</p>
            ) : (
              <TrackerRuleFields
                rule={form.rule}
                unit={form.unit}
                onChange={(r) => set('rule', r)}
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!form.northStar}
              onChange={(e) => set('northStar', e.target.checked)}
            />
            {t('northStarField')}
          </label>
          {ruleChanged && (
            <div className="sm:col-span-2">
              {field(
                t('reason'),
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />,
              )}
            </div>
          )}
          {measure && measure.targetHistory.length > 1 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground sm:col-span-2">
              {measure.targetHistory.map((h) => (
                <li key={h.effectiveFrom}>
                  {h.effectiveFrom}: {t(`rule.${h.rule.type}`)} — {h.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          {measure && (
            <Button
              variant="ghost"
              className="me-auto"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              {t('archive')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
