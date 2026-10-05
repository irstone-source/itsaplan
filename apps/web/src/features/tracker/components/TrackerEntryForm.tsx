'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { setEntry, type TrackerCell, type TrackerMeasure } from '@/lib/api/endpoints/tracker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toStored, toTyped } from '../utils/format';

export default function TrackerEntryForm({
  measure: m,
  cell: c,
  onDone,
}: {
  measure: TrackerMeasure;
  cell: TrackerCell;
  onDone: () => void;
}) {
  const t = useTranslations('tracker');
  const qc = useQueryClient();
  const [value, setValue] = useState(toTyped(m.unit, c.actual));
  const [done, setDone] = useState<boolean | null>(c.done);
  const [note, setNote] = useState(c.note);
  const [evidence, setEvidence] = useState(c.evidence);
  const [verified, setVerified] = useState(c.verified);
  const isDone = m.unit === 'done';
  const actual = isDone || value.trim() === '' ? null : toStored(m.unit, value);
  const valid = isDone ? done != null : actual != null && Number.isFinite(actual);
  const save = useMutation({
    mutationFn: () => setEntry(m.id, c.periodStart, { actual, done, note, evidence, verified }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracker'] });
      toast.success(t('saved'));
      onDone();
    },
  });

  return (
    <div className="space-y-2 border-t pt-2">
      {isDone ? (
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <Button
              key={String(v)}
              size="sm"
              variant={done === v ? 'default' : 'outline'}
              onClick={() => setDone(v)}
            >
              {t(v ? 'yes' : 'no')}
            </Button>
          ))}
        </div>
      ) : (
        <Input
          inputMode="decimal"
          placeholder={m.unit === 'money' ? '£' : t('actual')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <Input
        placeholder={t('evidencePlaceholder')}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
      />
      <Input
        placeholder={t('notePlaceholder')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        {t('verifiedLabel')}
      </label>
      <Button
        size="sm"
        className="w-full"
        disabled={!valid || save.isPending}
        onClick={() => save.mutate()}
      >
        {t('save')}
      </Button>
    </div>
  );
}
