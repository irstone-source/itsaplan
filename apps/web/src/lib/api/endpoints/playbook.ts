import { request } from '@/lib/api/core/client';

export const PLAYBOOK_BILLING = ['billable', 'retainer', 'non_billable'] as const;
export type PlaybookBilling = (typeof PLAYBOOK_BILLING)[number];

export const PLAYBOOK_CADENCES = ['monthly', 'quarterly', 'ad_hoc'] as const;
export type PlaybookCadence = (typeof PLAYBOOK_CADENCES)[number];

// A deliverable repeated for a client, priced by outcome (pence).
export interface PlaybookItem {
  id: number;
  initiativeId: number;
  title: string;
  description: string;
  pricePence: number;
  billing: PlaybookBilling;
  estimateMinutes: number | null;
  // How the outcome is judged, e.g. "Cost per deal toward £750".
  measure: string;
  cadence: PlaybookCadence;
  // The month of each quarter (1-3) a quarterly item falls due in.
  quarterMonth: number;
  typeId: number | null;
  labelIds: number[];
  active: boolean;
  position: number;
  stripePriceId: string | null;
}

export interface PlaybookGroup {
  initiativeId: number;
  title: string;
  billingModel: string | null;
  revenueClass: string | null;
  monthlyFeePence: number | null;
  // Active monthly items plus a third of the quarterly ones.
  monthlyPricedPence: number;
  // Minutes allocated a month, and the active items' estimates per month.
  monthlyMinutes: number | null;
  plannedMinutes: number;
  items: PlaybookItem[];
}

export type PlaybookItemInput = Partial<Omit<PlaybookItem, 'id' | 'stripePriceId'>>;

export const listPlaybook = (projectKey: string) =>
  request<PlaybookGroup[]>(`/projects/${projectKey}/playbook`);

export const createPlaybookItem = (
  projectKey: string,
  input: PlaybookItemInput & { initiativeId: number; title: string },
) =>
  request<PlaybookItem>(`/projects/${projectKey}/playbook`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updatePlaybookItem = (projectKey: string, id: number, patch: PlaybookItemInput) =>
  request<PlaybookItem>(`/projects/${projectKey}/playbook/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const deletePlaybookItem = (projectKey: string, id: number) =>
  request<void>(`/projects/${projectKey}/playbook/${id}`, { method: 'DELETE' });

// One spreadsheet row of a playbook import; every value is the cell as typed.
export interface PlaybookImportRow {
  client: string;
  deliverable: string;
  price: string;
  billing: string;
  cadence: string;
  quarterMonth: string;
  estimateHours: string;
  measure: string;
}

export interface PlaybookImportAction {
  kind: 'class' | 'label' | 'initiative' | 'item' | 'skip';
  text: string;
}

export const importPlaybook = (
  projectKey: string,
  input: { rows: PlaybookImportRow[]; setup: boolean; apply: boolean },
) =>
  request<{ actions: PlaybookImportAction[] }>(`/projects/${projectKey}/playbook/import`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
