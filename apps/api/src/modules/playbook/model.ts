import { t } from 'elysia';

export const playbookParams = t.Object({ projectKey: t.String(), itemId: t.Numeric() });

const billing = t.Union([t.Literal('billable'), t.Literal('retainer'), t.Literal('non_billable')], {
  description:
    'billable: charged at its price; retainer: covered by the monthly fee; non_billable: a cost.',
});
const cadence = t.Union([t.Literal('monthly'), t.Literal('quarterly'), t.Literal('ad_hoc')], {
  description: 'monthly: due every cycle; quarterly: due once a quarter; ad_hoc: added by hand.',
});

export const PlaybookItemResponse = t.Object({
  id: t.Number(),
  initiativeId: t.Number(),
  title: t.String(),
  description: t.String(),
  pricePence: t.Number(),
  billing: t.String(),
  estimateMinutes: t.Nullable(t.Number()),
  cadence: t.String(),
  quarterMonth: t.Number(),
  typeId: t.Nullable(t.Number()),
  labelIds: t.Array(t.Number()),
  active: t.Boolean(),
  position: t.Number(),
  stripePriceId: t.Nullable(t.String()),
});

export const PlaybookGroupResponse = t.Object({
  initiativeId: t.Number(),
  title: t.String(),
  billingModel: t.Nullable(t.String()),
  revenueClass: t.Nullable(t.String()),
  monthlyFeePence: t.Nullable(t.Number()),
  // What the active monthly items and a third of the quarterly ones are priced at.
  monthlyPricedPence: t.Number(),
  items: t.Array(PlaybookItemResponse),
});

export const PlaybookResponse = t.Array(PlaybookGroupResponse);

export const createPlaybookItemBody = t.Object({
  initiativeId: t.Integer({ description: 'The client initiative. From list_initiatives.' }),
  title: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  pricePence: t.Optional(t.Integer({ minimum: 0, description: 'Outcome price in pence.' })),
  billing: t.Optional(billing),
  estimateMinutes: t.Optional(
    t.Nullable(t.Integer({ minimum: 0, description: 'For capacity only, never for value.' })),
  ),
  cadence: t.Optional(cadence),
  quarterMonth: t.Optional(
    t.Integer({ minimum: 1, maximum: 3, description: 'Month of the quarter (1-3) it is due.' }),
  ),
  typeId: t.Optional(t.Nullable(t.Integer())),
  labelIds: t.Optional(t.Array(t.Integer())),
  active: t.Optional(t.Boolean()),
  position: t.Optional(t.Number()),
});

export const updatePlaybookItemBody = t.Partial(createPlaybookItemBody);

export const CyclePlaybookResponse = t.Object({
  // Items whose cadence makes them due in the cycle's month and not yet in it.
  due: t.Array(PlaybookItemResponse),
  // Ad-hoc items, offered but never due.
  adHoc: t.Array(PlaybookItemResponse),
  // Items already in the cycle, by the issue each became.
  added: t.Array(t.Object({ itemId: t.Number(), issueId: t.Number() })),
});

export const addPlaybookBody = t.Object({
  itemIds: t.Array(t.Integer(), { minItems: 1, description: 'Playbook item ids to add.' }),
});

export const AddPlaybookResponse = t.Object({
  created: t.Array(t.Object({ itemId: t.Number(), issueId: t.Number() })),
  skipped: t.Array(t.Number()),
});
