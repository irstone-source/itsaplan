'use client';

import { useTranslations } from 'next-intl';
import type { TargetRule, TrackerUnit } from '@/lib/api/endpoints/tracker';
import { Input } from '@/components/ui/input';
import { toStored, toTyped } from '../utils/format';

const RULES: TargetRule['type'][] = [
  'fixed',
  'linear',
  'compounding',
  'gate',
  'shelf',
  'leapfrog',
  'finance',
];

const blank: Record<TargetRule['type'], TargetRule> = {
  fixed: { type: 'fixed', value: 0 },
  linear: { type: 'linear', start: 0, step: 0 },
  compounding: { type: 'compounding', start: 0, ratePercent: 5 },
  gate: { type: 'gate', start: 0, target: 0, by: new Date().toISOString().slice(0, 10) },
  shelf: { type: 'shelf', value: 0 },
  leapfrog: { type: 'leapfrog', start: 0, steps: [] },
  finance: { type: 'finance' },
};

const SELECT = 'h-9 w-full rounded-md border bg-transparent px-2 text-sm';

// The target rule's type and its numbers. Money is typed in pounds.
export default function TrackerRuleFields({
  rule,
  unit,
  onChange,
}: {
  rule: TargetRule;
  unit: TrackerUnit;
  onChange: (rule: TargetRule) => void;
}) {
  const t = useTranslations('tracker.rule');
  const num = (label: string, value: number, set: (v: number) => void, money = true) => (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        inputMode="decimal"
        value={money ? toTyped(unit, value) : String(value)}
        onChange={(e) => set(money ? toStored(unit, e.target.value) : Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>{t('type')}</span>
        <select
          className={SELECT}
          value={rule.type}
          onChange={(e) => onChange(blank[e.target.value as TargetRule['type']])}
        >
          {RULES.map((r) => (
            <option key={r} value={r}>
              {t(r)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{t(`${rule.type}Hint`)}</p>
      <div className="grid grid-cols-2 gap-2">
        {(rule.type === 'fixed' || rule.type === 'shelf') &&
          num(t('value'), rule.value, (value) => onChange({ ...rule, value }))}
        {rule.type === 'linear' && (
          <>
            {num(t('start'), rule.start, (start) => onChange({ ...rule, start }))}
            {num(t('step'), rule.step, (step) => onChange({ ...rule, step }))}
          </>
        )}
        {rule.type === 'compounding' && (
          <>
            {num(t('start'), rule.start, (start) => onChange({ ...rule, start }))}
            {num(
              t('ratePercent'),
              rule.ratePercent,
              (ratePercent) => onChange({ ...rule, ratePercent }),
              false,
            )}
          </>
        )}
        {rule.type === 'gate' && (
          <>
            {num(t('start'), rule.start, (start) => onChange({ ...rule, start }))}
            {num(t('target'), rule.target, (target) => onChange({ ...rule, target }))}
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>{t('by')}</span>
              <Input
                type="date"
                value={rule.by}
                onChange={(e) => onChange({ ...rule, by: e.target.value })}
              />
            </label>
          </>
        )}
        {rule.type === 'leapfrog' && (
          <>
            {num(t('start'), rule.start, (start) => onChange({ ...rule, start }))}
            <div className="col-span-2 space-y-1">
              {rule.steps.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    type="date"
                    value={s.from}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        steps: rule.steps.map((x, j) =>
                          j === i ? { ...x, from: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    inputMode="decimal"
                    value={toTyped(unit, s.value)}
                    onChange={(e) =>
                      onChange({
                        ...rule,
                        steps: rule.steps.map((x, j) =>
                          j === i ? { ...x, value: toStored(unit, e.target.value) } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      onChange({ ...rule, steps: rule.steps.filter((_, j) => j !== i) })
                    }
                  >
                    {t('remove')}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs underline underline-offset-4"
                onClick={() =>
                  onChange({
                    ...rule,
                    steps: [
                      ...rule.steps,
                      { from: new Date().toISOString().slice(0, 10), value: 0 },
                    ],
                  })
                }
              >
                {t('addStep')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
