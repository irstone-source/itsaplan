#!/usr/bin/env bun
// Applies the rates in Cambray_12Week_Resource_Allocation.xlsx (Assumptions tab) to
// plan.cambray.co: billing settings, a day rate and billing model per client
// initiative, WSD split into its build and ads workstreams, time estimates on in CON,
// the internal projects flagged, and the current month's cycle in CON.
//
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/cambray-billing-setup.ts           plan
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/cambray-billing-setup.ts --apply   write
//
// Needs the release with billing (v1.2.1-cambray.2 or later). Safe to rerun.

/* eslint-disable @typescript-eslint/no-explicit-any -- a one-off ops script over the API's JSON */

const API = process.env.API_URL ?? 'https://plan-api.cambray.co';
const KEY = process.env.ITSAPLAN_API_KEY;
const APPLY = process.argv.includes('--apply');
if (!KEY) throw new Error('Set ITSAPLAN_API_KEY.');

const HOURS_PER_DAY = 6;
const INTERNAL_DAY_RATE_PENCE: number | null = null; // not stated in the workbook
const INTERNAL_PROJECTS = ['IPD', 'ADM', 'FIN', 'BRIDGE'];
// Client name (the part of the initiative title before " — ") → rate from the workbook.
const RATES: Record<string, { pence: number; model: 'day_rate' | 'retainer' | 'rev_share' }> = {
  Lanoguard: { pence: 100_000, model: 'retainer' },
  FGE: { pence: 50_000, model: 'retainer' },
  GSG: { pence: 45_000, model: 'retainer' },
  'Window Supply Direct': { pence: 45_000, model: 'day_rate' }, // Phase 1 build
};
const WSD_ADS = {
  title:
    'Window Supply Direct — Keep ads and the current site converting while the new one is built',
  description:
    '**Goal.** The £1,000 a week ads and management retainer keeps leads coming from the current site until the new one launches.\n\n**We measure.** Leads and orders from ads; site conversion rate; Google Ads account in good standing.\n\n**Control.** Weekly performance update to Chris and Wayne (CON-64).\n\n**Tickets by workstream**\n- Ads: CON-67 (Google Ads verification)\n- Current site conversion: CON-56, CON-59, CON-60, CON-66, CON-68\n- Client rhythm: CON-64\n\n**Open.** Lead target: not set yet (Ian). Day rate £1,000 is assumed on the Lanoguard basis (workbook note).',
  pence: 100_000,
  model: 'retainer' as const,
  tickets: [56, 59, 60, 64, 66, 67, 68],
};

async function api(method: string, path: string, body?: unknown): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    await Bun.sleep(150);
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'x-api-key': KEY!, 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status >= 500 && method === 'GET' && attempt < 5) {
      await Bun.sleep(2000 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? undefined : res.json();
  }
}
const write = async (label: string, method: string, path: string, body?: unknown) => {
  console.log(`${APPLY ? 'apply' : 'plan '}  ${label}`);
  if (APPLY) await api(method, path, body);
};

const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
// From the 29th on, plan the next month instead: the current one is nearly over.
if (now.getUTCDate() >= 29) {
  monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 2, 0);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthName = monthStart.toLocaleString('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

await write(
  `billing settings: ${HOURS_PER_DAY} h/day, internal rate ${INTERNAL_DAY_RATE_PENCE ?? 'none'}`,
  'PUT',
  '/god/billing',
  { hoursPerDay: HOURS_PER_DAY, internalDayRatePence: INTERNAL_DAY_RATE_PENCE },
);

const projects: any[] = await api('GET', '/projects');
const ref = (key: string) => projects.find((p) => p.key === key)?.ref;
for (const key of INTERNAL_PROJECTS) {
  const p = projects.find((x) => x.key === key);
  if (p && !p.internal)
    await write(`${key}: mark internal`, 'PATCH', `/projects/${p.ref}`, { internal: true });
}

const con = ref('CON');
if (!con) throw new Error('No CON project');
await write('CON: time estimates on', 'PATCH', `/projects/${con}/settings/estimates`, {
  points: false,
  time: true,
  logging: true,
});

const list = await api('GET', `/projects/${con}/initiatives`);
const initiatives: any[] = Array.isArray(list) ? list : (list.items ?? list.initiatives);
for (const i of initiatives) {
  const client = i.title.split(' — ')[0];
  const rate = RATES[client];
  if (rate && (i.dayRatePence !== rate.pence || i.billingModel !== rate.model)) {
    await write(
      `${client}: £${rate.pence / 100}/day ${rate.model}`,
      'PATCH',
      `/initiatives/${i.id}`,
      {
        dayRatePence: rate.pence,
        billingModel: rate.model,
      },
    );
  }
  // The build initiative keeps the build workstreams; ads and conversion move out.
  if (client === 'Window Supply Direct' && i.title !== WSD_ADS.title) {
    const kept = i.description
      .split('\n')
      .filter((line: string) => !/^- (Current site conversion|Ads|Client rhythm):/.test(line))
      .join('\n');
    if (kept !== i.description) {
      await write(
        'WSD build: drop the ads workstreams from its description',
        'PATCH',
        `/initiatives/${i.id}`,
        {
          description: kept,
        },
      );
    }
  }
  if (client === 'Stewart Golf' && i.status !== 'completed') {
    await write(
      'Stewart Golf: mark completed (no longer a client)',
      'PATCH',
      `/initiatives/${i.id}`,
      {
        status: 'completed',
      },
    );
  }
}

let ads = initiatives.find((i) => i.title === WSD_ADS.title);
if (!ads) {
  console.log(
    `${APPLY ? 'apply' : 'plan '}  WSD: create ads & management initiative at £${WSD_ADS.pence / 100}/day`,
  );
  if (APPLY) {
    const labels = (await api('GET', `/projects/${con}`)).labels as any[];
    const wsdLabel = labels.find((l) => l.name === 'Window Supply Direct');
    ads = await api('POST', `/projects/${con}/initiatives`, {
      title: WSD_ADS.title,
      description: WSD_ADS.description,
      status: 'active',
      dayRatePence: WSD_ADS.pence,
      billingModel: WSD_ADS.model,
      labelIds: wsdLabel ? [wsdLabel.id] : [],
    });
  }
}
for (const seq of WSD_ADS.tickets) {
  const issue = await api('GET', `/projects/${con}/issues/${seq}`);
  if (ads && issue.initiative?.id === ads.id) continue;
  await write(`CON-${seq}: move to WSD ads initiative`, 'PATCH', `/issues/${issue.id}`, {
    initiativeId: ads?.id ?? -1,
  });
}

const cycleList = await api('GET', `/projects/${con}/cycles`);
const cycles: any[] = Array.isArray(cycleList) ? cycleList : (cycleList.items ?? []);
if (!cycles.some((c) => c.startDate === ymd(monthStart))) {
  await write(
    `CON: create cycle "${monthName}" ${ymd(monthStart)}..${ymd(monthEnd)}`,
    'POST',
    `/projects/${con}/cycles`,
    {
      name: monthName,
      startDate: ymd(monthStart),
      endDate: ymd(monthEnd),
    },
  );
}
for (const c of cycles.filter((c) => c.name.startsWith('Week of ') && c.progress?.total === 0)) {
  await write(`CON: delete empty weekly cycle "${c.name}"`, 'DELETE', `/cycles/${c.id}`);
}

console.log(APPLY ? '\nDone.' : '\nDry run. Rerun with --apply to write.');
