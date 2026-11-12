import { describe, it, expect, beforeEach } from 'bun:test';
import { db, user } from '@repo/db';
import { eq } from 'drizzle-orm';
import { resetDb } from '#tests/helpers/db';
import { createProject } from '#tests/helpers/app';
import { addUser, createAgentUser, setup } from '../helpers';

// God mode for a second account: only the instance owner (the first god) gives or takes
// it, never for their own account or an agent's account, and a deactivated account is
// not given it.

describe('god role', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lets the instance owner give and take god mode', async () => {
    const { god } = await setup();
    const jo = await addUser({ name: 'Jo' });
    expect((await jo.api.god.users.get({ query: {} })).status).toBe(403);
    expect((await god.api.god['instance-owner'].get()).data).toEqual({ userId: god.id });

    const given = await god.api.god.users({ userId: jo.id }).role.patch({ role: 'god' });
    expect(given.status).toBe(200);
    expect(given.data).toMatchObject({ id: jo.id, role: 'god' });
    expect((await jo.api.god.users.get({ query: {} })).status).toBe(200);
    // The instance owner stays the first god.
    expect((await jo.api.god['instance-owner'].get()).data).toEqual({ userId: god.id });

    const taken = await god.api.god.users({ userId: jo.id }).role.patch({ role: 'user' });
    expect(taken.data).toMatchObject({ role: 'user' });
    expect((await jo.api.god.users.get({ query: {} })).status).toBe(403);
  });

  it('refuses another god, the owner themself, an agent and a deactivated account', async () => {
    const { god } = await setup();
    const jo = await addUser({ name: 'Jo' });
    const zak = await addUser({ name: 'Zak' });
    await god.api.god.users({ userId: jo.id }).role.patch({ role: 'god' });

    expect((await jo.api.god.users({ userId: zak.id }).role.patch({ role: 'god' })).status).toBe(
      403,
    );
    expect((await jo.api.god.users({ userId: god.id }).role.patch({ role: 'user' })).status).toBe(
      403,
    );
    expect((await god.api.god.users({ userId: god.id }).role.patch({ role: 'user' })).status).toBe(
      409,
    );
    expect((await zak.api.god.users({ userId: zak.id }).role.patch({ role: 'god' })).status).toBe(
      403,
    );

    await createProject(god.api, { key: 'MKT', name: 'Marketing' });
    const agentUserId = await createAgentUser(god, 'MKT');
    expect(
      (await god.api.god.users({ userId: agentUserId }).role.patch({ role: 'god' })).status,
    ).toBe(409);

    await god.api.god.users({ userId: zak.id }).deactivate.post();
    expect((await god.api.god.users({ userId: zak.id }).role.patch({ role: 'god' })).status).toBe(
      409,
    );

    // A god deactivated by a SCIM provider, which god mode cannot reactivate: the role
    // still comes off. God mode refuses to deactivate a god itself, so the row is written.
    await db.update(user).set({ active: false }).where(eq(user.id, jo.id));
    const taken = await god.api.god.users({ userId: jo.id }).role.patch({ role: 'user' });
    expect(taken.status).toBe(200);
    expect(taken.data).toMatchObject({ role: 'user', active: false });

    expect((await god.api.god.users({ userId: 'nobody' }).role.patch({ role: 'god' })).status).toBe(
      404,
    );
  });
});
