#!/usr/bin/env bun
// Resets plan.cambray.co to a clean slate (2 Nov 2026): every ticket is deleted, the
// projects outside the kept set are deleted, and the missing kept projects are
// created. Consulting keeps its cycles, initiatives, labels and playbook.
//
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/cambray-reset.ts           plan
//   API_URL=https://plan-api.cambray.co ITSAPLAN_API_KEY=... bun scripts/cambray-reset.ts --apply   write
//
// Take a backup first (scripts/ship.sh --backup): a deleted project cannot be restored
// from the app. Safe to rerun.

/* eslint-disable @typescript-eslint/no-explicit-any -- a one-off ops script over the API's JSON */

const API = process.env.API_URL ?? 'https://plan-api.cambray.co';
const KEY = process.env.ITSAPLAN_API_KEY;
const APPLY = process.argv.includes('--apply');
if (!KEY) throw new Error('Set ITSAPLAN_API_KEY.');

// The projects that stay. An existing project is matched by key, else by name; a
// missing one is created in the team that holds Consulting.
const KEEP = [
  { key: 'CON', name: 'Consulting' },
  { key: 'BRIDGE', name: 'Bridge Intelligence' },
  { key: 'ADM', name: 'Administration' },
  { key: 'FIN', name: 'Finance' },
  { key: 'LOOPS', name: 'Loops' },
  { key: 'PLAN', name: "It's a Plan (Cambray)" },
  { key: 'AI', name: 'Audience Intel' },
  { key: 'SIG', name: 'Signal' },
];

async function api(method: string, path: string, body?: unknown): Promise<any> {
  await Bun.sleep(100);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'x-api-key': KEY!, 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

const issuesOf = async (ref: string): Promise<{ id: number }[]> =>
  api('GET', `/projects/${ref}/issues?includeArchived=true&limit=500`);

const listed = await api('GET', '/projects');
const projects: any[] = Array.isArray(listed) ? listed : listed.items;
const con = projects.find((p) => p.key === 'CON');
if (!con) throw new Error('No CON project: nothing is changed.');

const kept = new Map<string, any>();
for (const want of KEEP) {
  const found =
    projects.find((p) => p.key === want.key) ??
    projects.find((p) => p.name.toLowerCase() === want.name.toLowerCase());
  if (found) kept.set(want.key, found);
}

console.log(`${APPLY ? 'APPLY' : 'PLAN'} on ${API}\n`);
for (const p of projects) {
  const keep = [...kept.values()].some((k) => k.id === p.id);
  const count = (await issuesOf(p.ref)).length;
  console.log(
    `${keep ? 'keep  ' : 'DELETE'}  ${p.key.padEnd(8)} ${p.name.padEnd(32)} ${count}${count === 500 ? '+' : ''} tickets`,
  );
}
for (const want of KEEP.filter((w) => !kept.has(w.key)))
  console.log(`create  ${want.key.padEnd(8)} ${want.name}`);
console.log('');

if (!APPLY) {
  console.log('Plan only. Rerun with --apply to write.');
  process.exit(0);
}

for (const p of projects) {
  if ([...kept.values()].some((k) => k.id === p.id)) continue;
  await api('DELETE', `/projects/${p.ref}`);
  console.log(`deleted project ${p.key}`);
}

for (const want of KEEP.filter((w) => !kept.has(w.key))) {
  const created = await api('POST', `/teams/${con.teamId}/projects`, {
    key: want.key,
    name: want.name,
  });
  kept.set(want.key, created);
  console.log(`created project ${want.key}`);
}

for (const [key, p] of kept) {
  const ref = p.ref ?? `${con.ref.split('.')[0]}.${key}`;
  let total = 0;
  for (;;) {
    const batch = await issuesOf(ref);
    if (batch.length === 0) break;
    for (let i = 0; i < batch.length; i += 100) {
      const ids = batch.slice(i, i + 100).map((b) => b.id);
      await api('POST', `/projects/${ref}/issues/bulk/delete`, { ids, subtasks: 'cascade' });
      total += ids.length;
    }
  }
  console.log(`emptied ${key}: ${total} tickets deleted`);
}

console.log('\nDone.');
