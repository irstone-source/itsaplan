import { describe, it, expect, beforeEach } from 'bun:test';
import { resetDb } from '#tests/helpers/db';
import { addUser, setup } from '../helpers';

// Adding one account to many projects at once from god mode, including projects of a
// team the account is not in yet, and taking it out of one again.

async function projectIds(actor: Awaited<ReturnType<typeof addUser>>, keys: string[]) {
  const ids: number[] = [];
  for (const key of keys) {
    await actor.api.projects.post({ key, name: key });
    ids.push((await actor.api.projects({ projectKey: key }).get()).data!.project.id);
  }
  return ids;
}

describe('god user projects', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('adds a user to projects across teams, joining the teams first', async () => {
    const { god } = await setup();
    const other = await addUser();
    const person = await addUser();
    const ids = [...(await projectIds(god, ['MKT', 'OPS'])), ...(await projectIds(other, ['FIN']))];

    const res = await god.api.god.users({ userId: person.id }).projects.post({ projectIds: ids });
    expect(res.status).toBe(200);
    expect(res.data!.projects.map((p) => p.projectKey).sort()).toEqual(['FIN', 'MKT', 'OPS']);
    expect(res.data!.projects.every((p) => p.role === 'member' && p.roleId != null)).toBe(true);

    // Repeating the call leaves existing memberships as they are.
    const again = await god.api.god.users({ userId: person.id }).projects.post({ projectIds: ids });
    expect(again.data!.projects).toHaveLength(3);

    // The person now reads the projects and sees them in their own list.
    const own = await person.api.projects.get();
    expect(own.data!.map((p) => p.key).sort()).toEqual(['FIN', 'MKT', 'OPS']);
  });

  it('removes a user from one project and refuses the last owner', async () => {
    const { god } = await setup();
    const person = await addUser();
    const [mkt, ops] = await projectIds(god, ['MKT', 'OPS']);
    await god.api.god.users({ userId: person.id }).projects.post({ projectIds: [mkt, ops] });

    const res = await god.api.god
      .users({ userId: person.id })
      .projects({ projectId: mkt })
      .delete();
    expect(res.status).toBe(200);
    expect(res.data!.projects.map((p) => p.projectKey)).toEqual(['OPS']);

    const last = await god.api.god.users({ userId: god.id }).projects({ projectId: mkt }).delete();
    expect(last.status).toBe(400);
  });

  it('refuses an unknown project and a non-god caller', async () => {
    const { god } = await setup();
    const person = await addUser();
    const bad = await god.api.god.users({ userId: person.id }).projects.post({ projectIds: [999] });
    expect(bad.status).toBe(400);
    const denied = await person.api.god
      .users({ userId: person.id })
      .projects.post({ projectIds: [1] });
    expect(denied.status).toBe(403);
  });
});
