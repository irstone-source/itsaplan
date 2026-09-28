#!/usr/bin/env bun
// Brands the Cambray instance and folds the consulting client boards into one
// Consulting project, organised by one initiative and one label per client. Product
// boards are left as they are.
//
//   ITSAPLAN_API_KEY=... bun scripts/cambray-restructure.ts           plan, change nothing
//   ITSAPLAN_API_KEY=... bun scripts/cambray-restructure.ts --apply   make the changes
//
// The API key is created in the app under Account -> API keys, signed in as the
// instance owner. Env overrides:
//   API_URL   default https://plan-api.cambray.co
//   CLIENTS   comma-separated project keys to fold in (default GSG,FGE,WSD,SGOLF,LANO,BIKEV)
//   TARGET    key of the consulting project (default CON)
//   LOGO      logo file (default scripts/cambray-mark-tile.svg: the teal mark on a dark tile)
//
// With --apply, each client issue is recreated in the consulting project with its
// state, priority, dates, assignee, labels, parent and comments, and a "Migrated from
// GSG-12" line. The original gets a comment naming its new id and is archived, so it
// stays restorable. A rerun skips issues already migrated. The old-to-new id map is
// written to ~/backups/itsaplan/restructure-<time>.csv.

/* eslint-disable @typescript-eslint/no-explicit-any -- a one-off ops script over the API's JSON */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const API = process.env.API_URL ?? 'https://plan-api.cambray.co';
const KEY = process.env.ITSAPLAN_API_KEY;
const CLIENTS = (process.env.CLIENTS ?? 'GSG,FGE,WSD,SGOLF,LANO,BIKEV')
  .split(',')
  .map((s) => s.trim());
const TARGET = process.env.TARGET ?? 'CON';
const LOGO = process.env.LOGO ?? new URL('./cambray-mark-tile.svg', import.meta.url).pathname;
const BRANDING = { appName: 'Cambray', accentColor: '#00E5CC' };
const LABEL_COLORS = [
  '#00E5CC',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
];
const APPLY = process.argv.includes('--apply');

if (!KEY) throw new Error('Set ITSAPLAN_API_KEY (Account -> API keys, as the instance owner).');

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'x-api-key': KEY!,
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const enc = encodeURIComponent;
const MARKER = (identifier: string) => `Migrated from ${identifier}`;

function mondayOf(d: Date): Date {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function comments(issueId: number) {
  const out: any[] = [];
  let cursor: unknown = null;
  do {
    const q = cursor ? `?cursor=${enc(JSON.stringify(cursor))}` : '';
    const page = await api('GET', `/issues/${issueId}/feed${q}`);
    out.push(...page.items.filter((i: any) => i.kind === 'comment'));
    cursor = page.nextCursor;
  } while (cursor);
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ── read ──────────────────────────────────────────────────────────────────────
const projects: any[] = await api('GET', '/projects');
console.log('Projects on the instance:');
const sources: { project: any; scaffold: any; issues: any[] }[] = [];
for (const p of projects) {
  const board = await api('GET', `/projects/${enc(p.ref)}/issues/board`);
  const isClient = CLIENTS.includes(p.key);
  console.log(
    `  ${isClient ? 'fold ' : 'keep '} ${p.ref.padEnd(22)} ${p.name.padEnd(28)} ${board.issues.length} active issues`,
  );
  if (isClient)
    sources.push({
      project: p,
      scaffold: await api('GET', `/projects/${enc(p.ref)}`),
      issues: board.issues,
    });
}
const missing = CLIENTS.filter((k) => !projects.some((p) => p.key === k));
if (missing.length) console.log(`  (no project with key ${missing.join(', ')}: skipped)`);
const total = sources.reduce((n, s) => n + s.issues.length, 0);

const logo = `data:image/svg+xml;base64,${Buffer.from(readFileSync(LOGO)).toString('base64')}`;
const existingTarget = projects.find((p) => p.key === TARGET);

console.log(`
Plan:
  1. branding: name "${BRANDING.appName}", accent ${BRANDING.accentColor}, logo ${LOGO}
  2. ${existingTarget ? `reuse project ${existingTarget.ref}` : `create project ${TARGET} "Consulting"`} with initiatives and cycles on
  3. one label and one initiative per client: ${sources.map((s) => s.project.name).join(', ')}
  4. cycles for this week and next, unless cycles already cover them
  5. move ${total} issues into ${TARGET}; archive each original with a pointer to its new id
  6. add each assignee of those issues to ${TARGET}
Projects marked "keep" are not touched.`);

if (!APPLY) {
  console.log('\nDry run. Rerun with --apply to make these changes.');
  process.exit(0);
}

// ── branding ──────────────────────────────────────────────────────────────────
await api('PUT', '/god/branding', { ...BRANDING, logo });
console.log('\nbranding set');

// ── consulting project ───────────────────────────────────────────────────────
const target =
  existingTarget ??
  (await api('POST', '/projects', {
    key: TARGET,
    name: 'Consulting',
    description:
      'Every consulting client in one place: an initiative and a label per client, planned in weekly cycles.',
  }));
const ref: string = target.ref;
await api('PATCH', `/projects/${enc(ref)}/settings`, {
  features: { initiatives: true, cycles: true },
});
let scaffold = await api('GET', `/projects/${enc(ref)}`);
console.log(`project ${ref} ready`);

// Assignees must be members of the project before an issue can name them.
const assignees = new Set<string>();
for (const s of sources)
  for (const i of s.issues) if (i.assigneeUserId) assignees.add(i.assigneeUserId);
const members = new Set<string>(scaffold.assignees.map((a: any) => a.userId));
for (const userId of assignees) {
  if (!members.has(userId))
    await api('POST', `/god/users/${enc(userId)}/projects`, { projectIds: [target.id] });
}
scaffold = await api('GET', `/projects/${enc(ref)}`);

// ── labels and initiatives ───────────────────────────────────────────────────
const labelByName = new Map<string, number>(
  scaffold.labels.map((l: any) => [l.name.toLowerCase(), l.id]),
);
async function labelId(name: string, color: string): Promise<number> {
  const found = labelByName.get(name.toLowerCase());
  if (found) return found;
  const created = await api('POST', `/projects/${enc(ref)}/labels`, { name, color });
  labelByName.set(name.toLowerCase(), created.id);
  return created.id;
}
const initiatives: any[] = await api('GET', `/projects/${enc(ref)}/initiatives/options`);
const initiativeByTitle = new Map<string, number>(
  initiatives.map((i: any) => [i.title ?? i.name, i.id]),
);
const clientLabel = new Map<string, number>();
const clientInitiative = new Map<string, number>();
for (const [n, s] of sources.entries()) {
  const name = s.project.name;
  clientLabel.set(s.project.key, await labelId(name, LABEL_COLORS[n % LABEL_COLORS.length]));
  let id = initiativeByTitle.get(name);
  if (!id) {
    id = (
      await api('POST', `/projects/${enc(ref)}/initiatives`, {
        title: name,
        description: `Consulting work for ${name}.`,
      })
    ).id;
  }
  clientInitiative.set(s.project.key, id!);
}
console.log(`labels and initiatives ready for ${sources.length} clients`);

// ── cycles ────────────────────────────────────────────────────────────────────
const cycleList = await api('GET', `/projects/${enc(ref)}/cycles`);
const cycles: any[] = Array.isArray(cycleList) ? cycleList : (cycleList.items ?? []);
for (const offset of [0, 7]) {
  const start = mondayOf(new Date());
  start.setUTCDate(start.getUTCDate() + offset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const covered = cycles.some((c: any) => c.startDate <= ymd(start) && c.endDate >= ymd(start));
  if (!covered) {
    await api('POST', `/projects/${enc(ref)}/cycles`, {
      name: `Week of ${ymd(start)}`,
      startDate: ymd(start),
      endDate: ymd(end),
    });
  }
}
console.log('cycles ready');

// ── issues ────────────────────────────────────────────────────────────────────
const targetBoard = await api('GET', `/projects/${enc(ref)}/issues/board`);
const alreadyMoved = new Map<string, any>();
for (const i of targetBoard.issues) {
  const m = /Migrated from ([A-Z0-9]+-\d+)/.exec(i.description ?? '');
  if (m) alreadyMoved.set(m[1], i);
}
const columnFor = (stateType: string) =>
  scaffold.columns.find((c: any) => c.stateType === stateType) ?? scaffold.columns[0];

mkdirSync(`${homedir()}/backups/itsaplan`, { recursive: true });
const mapFile = `${homedir()}/backups/itsaplan/restructure-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
const rows = ['old,new,title'];
const newIdByOldId = new Map<number, number>();
const toArchive: any[] = [];

for (const s of sources) {
  const columnById = new Map(s.scaffold.columns.map((c: any) => [c.id, c]));
  const labelNameById = new Map(s.scaffold.labels.map((l: any) => [l.id, l.name]));
  // Parents first, so a subtask can point at its parent's new id.
  const ordered = [...s.issues].sort(
    (a, b) => Number(a.parentId != null) - Number(b.parentId != null),
  );
  let moved = 0;
  for (const issue of ordered) {
    const done = alreadyMoved.get(issue.identifier);
    if (done) {
      newIdByOldId.set(issue.id, done.id);
      continue;
    }
    const column: any = columnById.get(issue.columnId);
    const labelIds = [clientLabel.get(s.project.key)!];
    for (const id of issue.labelIds) {
      const name = labelNameById.get(id) as string | undefined;
      if (name) labelIds.push(await labelId(name, '#6b7280'));
    }
    const created = await api('POST', `/projects/${enc(ref)}/issues`, {
      columnId: columnFor(column?.stateType ?? 'unstarted').id,
      title: issue.title,
      description: `${issue.description ?? ''}\n\n---\n_${MARKER(issue.identifier)}_`.trimStart(),
      priority: issue.priority ?? undefined,
      startDate: issue.startDate ?? undefined,
      dueDate: issue.dueDate ?? undefined,
      assigneeUserId: issue.assigneeUserId ?? undefined,
      initiativeId: clientInitiative.get(s.project.key),
      parentId: issue.parentId != null ? newIdByOldId.get(issue.parentId) : undefined,
      labelIds: [...new Set(labelIds)],
    });
    newIdByOldId.set(issue.id, created.id);
    for (const c of await comments(issue.id)) {
      await api('POST', `/issues/${created.id}/comments`, {
        body: `**${c.actorName ?? 'Someone'}** (${c.createdAt.slice(0, 10)}):\n\n${c.body}`,
      });
    }
    await api('POST', `/issues/${issue.id}/comments`, { body: `Moved to ${created.identifier}.` });
    toArchive.push(issue);
    rows.push(`${issue.identifier},${created.identifier},"${issue.title.replaceAll('"', '""')}"`);
    writeFileSync(mapFile, rows.join('\n') + '\n');
    moved++;
  }
  console.log(`${s.project.key}: moved ${moved} issues`);
}

// Subtasks first: a parent archived while it still has active subtasks would take
// them with it.
toArchive.sort((a, b) => Number(b.parentId != null) - Number(a.parentId != null));
for (const issue of toArchive)
  await api('POST', `/issues/${issue.id}/archive`, { subtasks: 'detach' });
console.log(`archived ${toArchive.length} originals`);
writeFileSync(mapFile, rows.join('\n') + '\n');

console.log(`\nDone. Old-to-new ids: ${mapFile}`);
console.log(
  `The emptied client projects are kept; delete them in each project's settings once you are happy.`,
);
