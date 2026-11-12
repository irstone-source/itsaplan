import { createProject } from '#tests/helpers/app';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, joinProject, setup, type Actor } from '../../../god/__tests__/helpers';
import { syncRizeIfConnected } from '../../service';

// The Rize sync against a fake Rize: entries are copied, matched to people, tickets
// and clients, mirrored as worklogs, and judged against each client's monthly limit.

type FakeEntry = {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  description: string;
  user: { email: string };
  project: { name: string; client: { name: string } | null } | null;
  task: { name: string } | null;
};

let entries: FakeEntry[] = [];
let server: ReturnType<typeof Bun.serve>;

function entry(
  id: string,
  email: string,
  minutes: number,
  task: string | null,
  client: string | null,
): FakeEntry {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60_000);
  return {
    id,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    duration: minutes * 60,
    description: task ? '' : 'misc work',
    user: { email },
    project: client ? { name: `${client} ads`, client: { name: client } } : null,
    task: task ? { name: task } : null,
  };
}

async function scaffold(god: Actor) {
  await createProject(god.api, { key: 'CON', name: 'Consulting' });
  const con = god.api.projects({ projectKey: 'CON' });
  const columns = (await con.get()).data!.columns;
  const fge = (await con.initiatives.post({ title: 'FGE — 32 sales a month', monthlyMinutes: 300 }))
    .data!;
  const ticket = (
    await con.issues.post({ columnId: columns[0]!.id, title: 'Ads', initiativeId: fge.id })
  ).data!;
  await god.api.god.rize.put({ apiKey: 'rize-test-key' });
  return { con, fge, ticket };
}

describe('Rize sync', () => {
  beforeEach(async () => {
    await resetDb();
    entries = [];
    server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ data: { timeEntries: entries } }),
    });
    process.env.RIZE_API_URL = `http://localhost:${server.port}/graphql`;
  });

  afterEach(async () => {
    delete process.env.RIZE_API_URL;
    await server.stop(true);
  });

  it('matches tickets, mirrors worklogs, reconciles by hand and flags the limit', async () => {
    const { god } = await setup();
    const { con, fge, ticket } = await scaffold(god);
    const ref = `CON-${ticket.sequenceNumber}`;
    entries = [
      entry('r1', god.email, 120, `${ref} — Ads`, 'Forever Green Energy'),
      entry('r2', god.email, 60, null, 'Forever Green Energy'),
    ];

    const synced = await god.api.god.rize.sync.post();
    expect(synced.data).toEqual({ synced: 2, matched: 1 });

    const worklogs = (await god.api.issues({ issueId: ticket.id }).worklogs.get()).data!;
    expect(worklogs).toHaveLength(1);
    expect(worklogs[0]).toMatchObject({ minutes: 120 });

    let time = (await con.time.get({ query: {} })).data!;
    expect(time.clients).toEqual([
      {
        initiativeId: fge.id,
        title: fge.title,
        trackedMinutes: 120,
        limitMinutes: 300,
        state: 'ok',
      },
    ]);
    expect(time.unmatched.map((u) => u.minutes)).toEqual([60]);
    expect(time.rizeClients).toEqual([{ name: 'Forever Green Energy', initiativeId: null }]);

    // Mapping the Rize client counts its loose hour toward FGE: 180 of 300 is 60%.
    await con.time.clients.put({ rizeClient: 'Forever Green Energy', initiativeId: fge.id });
    time = (await con.time.get({ query: {} })).data!;
    expect(time.clients[0]).toMatchObject({ trackedMinutes: 180, state: 'flag' });

    // Linking it to the ticket by hand makes a worklog, and a resync keeps the link.
    const loose = time.unmatched[0]!.id;
    await con.time.entries({ entryId: loose }).link.post({ issueId: ticket.id });
    await syncRizeIfConnected();
    expect((await god.api.issues({ issueId: ticket.id }).worklogs.get()).data).toHaveLength(2);
    time = (await con.time.get({ query: {} })).data!;
    expect(time.unmatched).toEqual([]);
    expect(time.matchedMinutes).toBe(180);

    // An entry deleted in Rize goes, with its worklog.
    entries = [entries[1]!];
    await syncRizeIfConnected();
    expect((await god.api.issues({ issueId: ticket.id }).worklogs.get()).data).toHaveLength(1);

    // 70% of the limit is down tools.
    entries.push(entry('r3', god.email, 180, `${ref} — more ads`, null));
    await syncRizeIfConnected();
    time = (await con.time.get({ query: {} })).data!;
    expect(time.clients[0]).toMatchObject({ trackedMinutes: 240, state: 'stop' });
    await con.playbook.post({ initiativeId: fge.id, title: 'Ad management', pricePence: 150000 });
    const playbook = (await con.playbook.get()).data!;
    expect(playbook[0]).toMatchObject({ trackedMinutes: 240, timeState: 'stop' });
  });

  it('keeps the connection to the god role and refuses tickets from another project', async () => {
    const { god } = await setup();
    const { con } = await scaffold(god);
    const member = await addUser({ name: 'Jo' });
    await joinProject(god, member, 'CON', 'member');
    expect((await member.api.god.rize.get()).status).toBe(403);
    expect((await member.api.god.rize.put({ apiKey: 'x' })).status).toBe(403);

    await createProject(god.api, { key: 'OTH', name: 'Other' });
    const other = god.api.projects({ projectKey: 'OTH' });
    const col = (await other.get()).data!.columns[0]!.id;
    const foreign = (await other.issues.post({ columnId: col, title: 'x' })).data!;
    entries = [entry('r9', god.email, 30, null, null)];
    await god.api.god.rize.sync.post();
    const loose = (await con.time.get({ query: {} })).data!.unmatched[0]!.id;
    const res = await con.time.entries({ entryId: loose }).link.post({ issueId: foreign.id });
    expect(res.status).toBe(400);
  });
});
