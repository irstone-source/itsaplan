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
