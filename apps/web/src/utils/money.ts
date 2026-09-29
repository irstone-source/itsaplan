const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

// Whole pounds from pence, e.g. 90000 -> "£900".
export const formatPence = (pence: number) => GBP.format(Math.round(pence / 100));

export interface IssueValue {
  pence: number;
  internal: boolean;
  overridden: boolean;
}

// What an issue is worth: the value set by hand, or its estimate in days times
// its initiative's day rate. Internal work (an internal project, or an initiative
// billed as internal) is costed at the internal day rate. Null when there is no
// estimate or no rate to work it out from.
export function issueValue(
  issue: {
    estimateMinutes: number | null;
    valueOverridePence: number | null;
    initiative: { billingModel: string | null; dayRatePence: number | null } | null;
  },
  billing: { hoursPerDay: number; internalDayRatePence: number | null } | undefined,
  projectInternal: boolean,
): IssueValue | null {
  const internal = projectInternal || issue.initiative?.billingModel === 'internal';
  if (issue.valueOverridePence != null) {
    return { pence: issue.valueOverridePence, internal, overridden: true };
  }
  const rate = internal ? billing?.internalDayRatePence : issue.initiative?.dayRatePence;
  if (!issue.estimateMinutes || rate == null || !billing) return null;
  const pence = Math.round((issue.estimateMinutes / 60 / billing.hoursPerDay) * rate);
  return { pence, internal, overridden: false };
}

// "£450", or "−£150" for internal cost.
export const formatValue = (value: IssueValue) =>
  `${value.internal ? '−' : ''}${formatPence(value.pence)}`;
