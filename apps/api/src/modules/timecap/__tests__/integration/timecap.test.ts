import { describe, it, expect, beforeEach } from 'bun:test';
import { auth } from '@repo/auth';
import { resetDb } from '#tests/helpers/db';
import { apiKeyApi, type Api, createProject } from '#tests/helpers/app';
import { addProjectMember } from '#tests/helpers/members';
import { createRole } from '#tests/helpers/roles';
import { addUser, joinProject, setup, type Actor } from '../../../god/__tests__/helpers';
import { londonDate } from '../../london';
import { pruneBlocks } from '../../service';

// Time capture: the agent uploads blocks, Plan suggests a ticket or a client for
// each, the person confirms, splits, ignores or captures them, and confirmed time is
// logged on the ticket and counted on the Time page.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Blocks sit one hour ahead of the test, so none falls in a closed week. A block a few
// hours later can fall on the next London day, so tests read each block on its own day.
const base = Date.now() + HOUR;

interface BlockOptions {
  title?: string;
  app?: string;
  domain?: string | null;
  source?: 'activity' | 'call' | 'manual';
  detail?: Record<string, unknown>;
  // Minutes from `base`; negative is in the past.
  offset?: number;
  minutes?: number;
}

function block(sourceKey: string, options: BlockOptions = {}) {
  const start = base + (options.offset ?? 0) * MINUTE;
  return {
    sourceKey: `${sourceKey}-00000000`,
    source: options.source ?? 'activity',
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + (options.minutes ?? 30) * MINUTE).toISOString(),
    app: options.app ?? 'Google Chrome',
    title: options.title ?? 'Campaigns - Google Ads',
    domain: options.domain === undefined ? 'ads.google.com' : options.domain,
    detail: options.detail,
  };
}

const dayOf = (offsetMinutes = 0) => londonDate(new Date(base + offsetMinutes * MINUTE));

async function upload(api: Api, blocks: ReturnType<typeof block>[], device = 'mac') {
  const res = await api.time.agent.blocks.post({ device, blocks });
  expect(res.status).toBe(200);
  return res.data!;
}

async function myDay(api: Api, date = dayOf()) {
  const res = await api.me.time.get({ query: { date } });
  expect(res.status).toBe(200);
  return res.data!;
}

async function scaffold(owner: Actor) {
  await createProject(owner.api, { key: 'CON', name: 'Consulting' });
  const con = owner.api.projects({ projectKey: 'CON' });
  const columns = (await con.get()).data!.columns;
  const todo = columns.find((c) => c.stateType === 'unstarted')!;
  const started = columns.find((c) => c.stateType === 'started')!;
  const fge = (await con.initiatives.post({ title: 'FGE — 32 sales a month', monthlyMinutes: 300 }))
    .data!;
  return { con, todo, started, fge };
}

describe('Time capture', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('takes the agent heartbeat and blocks on an API key, idempotently', async () => {
    const { god } = await setup();
    await scaffold(god);
    const member = await addUser({ name: 'Jo' });
    await joinProject(god, member, 'CON', 'member');
    const key = await auth.api.createApiKey({ body: { userId: member.id, name: 'agent' } });
    const agent = apiKeyApi(key.key);

    const beat = await agent.time.agent.heartbeat.post({
      device: 'mac',
      platform: 'darwin',
      version: '0.1.0',
      awOk: true,
    });
    expect(beat.status).toBe(200);
    expect(beat.data).toMatchObject({ name: 'mac', platform: 'darwin', trackerOk: true });

    const first = await upload(agent, [block('k1'), block('k2', { offset: 30, title: 'Inbox' })]);
    expect(first).toEqual({ inserted: 2, updated: 0, skipped: 0 });
    const again = await upload(agent, [block('k1'), block('k2', { offset: 30, title: 'Inbox' })]);
    expect(again).toEqual({ inserted: 0, updated: 2, skipped: 0 });

    const day = await myDay(member.api);
    expect(day.blocks).toHaveLength(2);
    expect(day.blocks[0]).toMatchObject({
      device: 'mac',
      seconds: 1800,
      status: 'pending',
      locked: false,
      suggestion: null,
    });
    expect(day.totals).toMatchObject({ capturedSeconds: 3600, pendingSeconds: 3600 });
    expect(day.devices).toHaveLength(1);
    expect(day.devices[0]).toMatchObject({ name: 'mac', trackerOk: true });
    expect((await member.api.me.time.status.get()).data).toMatchObject({ active: true });

    const bad = await agent.time.agent.blocks.post({
      device: 'mac',
      blocks: [{ ...block('k3'), endedAt: block('k3').startedAt }],
    });
    expect(bad.status).toBe(400);
    const long = await agent.time.agent.blocks.post({
      device: 'mac',
      blocks: [block('k4', { minutes: 25 * 60 })],
    });
    expect(long.status).toBe(400);
  });

  it('never overwrites a confirmed or ignored block', async () => {
    const { god } = await setup();
    const { con, todo, fge } = await scaffold(god);
    const ticket = (
      await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id })
    ).data!;
    await upload(god.api, [block('k1'), block('k2', { offset: 30 })]);
    let day = await myDay(god.api);
    const [a, b] = day.blocks;
    await god.api.me.time
      .blocks({ blockId: a!.id })
      .post({ action: 'confirm', issueId: ticket.id });
    await god.api.me.time.blocks({ blockId: b!.id }).post({ action: 'ignore' });

    const res = await upload(god.api, [
      block('k1', { title: 'Changed' }),
      block('k2', { offset: 30, title: 'Changed' }),
    ]);
    expect(res).toEqual({ inserted: 0, updated: 0, skipped: 2 });
    day = await myDay(god.api);
    expect(day.blocks.map((x) => [x.status, x.title])).toEqual([
      ['confirmed', 'Campaigns - Google Ads'],
      ['ignored', 'Campaigns - Google Ads'],
    ]);
  });

  it('suggests in order: ticket id, rule, in-progress ticket, call', async () => {
    const { god } = await setup();
    const { con, todo, started, fge } = await scaffold(god);
    const ads = (await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id }))
      .data!;
    const site = (
      await con.issues.post({ columnId: todo.id, title: 'Site', assigneeUserId: god.id })
    ).data!;
    const rule = await god.api.me.time.rules.post({
      field: 'domain',
      pattern: 'ads.google',
      initiativeId: fge.id,
    });
    expect(rule.status).toBe(201);
    const label = (await con.labels.post({ name: 'Forever Green Energy' })).data!;
    await god.api.initiatives({ initiativeId: fge.id }).patch({ labelIds: [label.id] });

    // A ticket in progress covers every block after it starts, so the call and the
    // loose block go up before it does.
    await upload(god.api, [
      block('ticket', { title: `${ads.identifier} Ads review` }),
      block('rule', { offset: 30 }),
      block('call', {
        offset: 90,
        source: 'call',
        app: 'Phone',
        domain: null,
        title: 'Call with Forever Green Energy',
        detail: { direction: 'in', contact: 'Forever Green Energy', number: '+441234' },
      }),
      block('none', { offset: 120, domain: null, app: 'Finder', title: 'Downloads' }),
    ]);
    await god.api.issues({ issueId: site.id }).patch({ columnId: started.id });
    await upload(god.api, [
      block('progress', { offset: 60, domain: null, app: 'Code', title: 'site.tsx' }),
    ]);
    const day = await myDay(god.api);
    expect(day.blocks.map((b) => b.suggestion)).toMatchObject([
      {
        issue: { id: ads.id, identifier: ads.identifier },
        initiative: { id: fge.id },
        confidence: 95,
      },
      { issue: null, initiative: { id: fge.id }, confidence: 85 },
      { issue: { id: site.id }, initiative: null, confidence: 60 },
      { issue: null, initiative: { id: fge.id }, confidence: 70 },
      null,
    ]);
    expect(day.totals.confidentPending).toBe(2);

    // A second ticket in progress lowers the confidence to 40.
    const more = (
      await con.issues.post({ columnId: todo.id, title: 'More', assigneeUserId: god.id })
    ).data!;
    await god.api.issues({ issueId: more.id }).patch({ columnId: started.id });
    await upload(god.api, [
      block('progress', { offset: 60, domain: null, app: 'Code', title: 'site.tsx' }),
    ]);
    expect((await myDay(god.api)).blocks[2]!.suggestion).toMatchObject({
      issue: { id: more.id },
      confidence: 40,
    });
  });

  it("hides another person's blocks and rules", async () => {
    const { god } = await setup();
    await scaffold(god);
    const member = await addUser({ name: 'Jo' });
    await joinProject(god, member, 'CON', 'member');
    await upload(member.api, [block('k1')]);
    const [mine] = (await myDay(member.api)).blocks;
    const rule = (
      await member.api.me.time.rules.post({ field: 'app', pattern: 'Chrome', ignore: true })
    ).data!;

    expect((await myDay(god.api)).blocks).toEqual([]);
    expect(
      (await god.api.me.time.blocks({ blockId: mine!.id }).post({ action: 'ignore' })).status,
    ).toBe(404);
    expect(
      (await god.api.me.time.blocks({ blockId: mine!.id }).split.post({ at: mine!.endedAt }))
        .status,
    ).toBe(404);
    expect((await god.api.me.time.rules({ ruleId: rule.id }).delete()).status).toBe(404);
    expect((await god.api.me.time.rules.get()).data).toEqual([]);
  });

  it('confirm logs the time on the ticket, reset removes it, ignore keeps it off', async () => {
    const { god } = await setup();
    const { con, todo, fge } = await scaffold(god);
    const ticket = (
      await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id })
    ).data!;
    await upload(god.api, [block('k1', { title: `${ticket.identifier} Ads`, minutes: 25 })]);
    const [b] = (await myDay(god.api)).blocks;
    const blocks = god.api.me.time.blocks({ blockId: b!.id });
    const worklogs = () =>
      god.api
        .issues({ issueId: ticket.id })
        .worklogs.get()
        .then((r) => r.data!);

    const confirmed = await blocks.post({ action: 'confirm' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.data).toMatchObject({
      status: 'confirmed',
      issue: { id: ticket.id },
      initiative: { id: fge.id },
    });
    const logged = await worklogs();
    // The note names the app only: the title is the person's.
    expect(logged).toMatchObject([{ minutes: 25, note: 'Time capture: Google Chrome' }]);
    expect(new Date(logged[0]!.spentOn).toISOString().slice(0, 10)).toBe(dayOf());

    expect((await blocks.post({ action: 'reset' })).data).toMatchObject({
      status: 'pending',
      issue: null,
      initiative: null,
    });
    expect(await worklogs()).toEqual([]);

    expect(
      (await blocks.post({ action: 'confirm', initiativeId: fge.id, issueId: null })).data,
    ).toMatchObject({
      status: 'confirmed',
      issue: null,
      initiative: { id: fge.id },
    });
    expect(await worklogs()).toEqual([]);

    expect((await blocks.post({ action: 'ignore' })).data).toMatchObject({ status: 'ignored' });
    expect((await myDay(god.api)).totals).toMatchObject({
      ignoredSeconds: 1500,
      confirmedSeconds: 0,
    });

    const nothing = await upload(god.api, [block('k2', { offset: 60 })]);
    expect(nothing.inserted).toBe(1);
    const [c] = (await myDay(god.api)).blocks.filter((x) => x.status === 'pending');
    expect(
      (await god.api.me.time.blocks({ blockId: c!.id }).post({ action: 'confirm' })).status,
    ).toBe(400);
  });

  it('split keeps the seconds and the allocation', async () => {
    const { god } = await setup();
    const { con, todo } = await scaffold(god);
    const ticket = (await con.issues.post({ columnId: todo.id, title: 'Ads' })).data!;
    await upload(god.api, [block('k1', { minutes: 60 })]);
    const [b] = (await myDay(god.api)).blocks;
    await god.api.me.time
      .blocks({ blockId: b!.id })
      .post({ action: 'confirm', issueId: ticket.id });

    const outside = await god.api.me.time.blocks({ blockId: b!.id }).split.post({ at: b!.endedAt });
    expect(outside.status).toBe(400);
    const at = new Date(base + 20 * MINUTE).toISOString();
    const split = await god.api.me.time.blocks({ blockId: b!.id }).split.post({ at });
    expect(split.status).toBe(200);
    expect(split.data!.map((x) => [x.seconds, x.status, x.issue?.id])).toEqual([
      [1200, 'confirmed', ticket.id],
      [2400, 'confirmed', ticket.id],
    ]);

    const day = await myDay(god.api);
    expect(day.blocks).toHaveLength(2);
    expect(day.totals).toMatchObject({ capturedSeconds: 3600, confirmedSeconds: 3600 });
    const worklogs = (await god.api.issues({ issueId: ticket.id }).worklogs.get()).data!;
    expect(worklogs.map((w) => w.minutes).sort()).toEqual([20, 40]);

    // The agent re-sends the original block on its next sync; the halves stay.
    await upload(god.api, [block('k2', { offset: 120, minutes: 30 })]);
    const [p] = (await myDay(god.api)).blocks.filter((x) => x.status === 'pending');
    await god.api.me.time
      .blocks({ blockId: p!.id })
      .split.post({ at: new Date(base + 130 * MINUTE).toISOString() });
    expect(await upload(god.api, [block('k2', { offset: 120, minutes: 30 })])).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 1,
    });
    expect((await myDay(god.api)).totals.capturedSeconds).toBe(5400);
  });

  it('capture creates a ticket assigned to the person and confirms the block to it', async () => {
    const { god } = await setup();
    const { fge } = await scaffold(god);
    await upload(god.api, [block('k1')]);
    const [b] = (await myDay(god.api)).blocks;

    const captured = await god.api.me.time
      .blocks({ blockId: b!.id })
      .capture.post({ projectKey: 'CON', title: 'Ads review', initiativeId: fge.id });
    expect(captured.status).toBe(200);
    expect(captured.data).toMatchObject({ status: 'confirmed', initiative: { id: fge.id } });
    const issue = (await god.api.issues({ issueId: captured.data!.issue!.id }).get()).data!;
    expect(issue).toMatchObject({
      title: 'Ads review',
      assigneeUserId: god.id,
      projectId: expect.any(Number),
    });
    expect(captured.data!.issue!.identifier).toBe(issue.identifier);
    expect((await god.api.issues({ issueId: issue.id }).worklogs.get()).data).toHaveLength(1);

    // A member whose role cannot create work items is refused, and so is a non-member.
    const reader = await createRole(god.api, 'CON', {
      name: 'Reader',
      permissions: { work_items: { read: true } },
    });
    const member = await addProjectMember(god.api, 'CON', reader.data!.id);
    await upload(member, [block('m1')]);
    const [mine] = (await myDay(member)).blocks;
    const refused = await member.me.time
      .blocks({ blockId: mine!.id })
      .capture.post({ projectKey: 'CON', title: 'x' });
    expect(refused.status).toBe(403);
    const stranger = await addUser({ name: 'Sam' });
    await upload(stranger.api, [block('s1')]);
    const [theirs] = (await myDay(stranger.api)).blocks;
    const unseen = await stranger.api.me.time
      .blocks({ blockId: theirs!.id })
      .capture.post({ projectKey: 'CON', title: 'x' });
    expect(unseen.status).toBe(403);
  });

  it('remember makes a rule the next upload uses, and a confirmed rule counts a hit', async () => {
    const { god } = await setup();
    const { fge } = await scaffold(god);
    await upload(god.api, [block('k1')]);
    const [b] = (await myDay(god.api)).blocks;
    await god.api.me.time
      .blocks({ blockId: b!.id })
      .post({ action: 'confirm', initiativeId: fge.id, remember: true });

    let rules = (await god.api.me.time.rules.get()).data!;
    expect(rules).toMatchObject([
      {
        personal: true,
        field: 'domain',
        pattern: 'ads.google.com',
        initiative: { id: fge.id },
        hits: 0,
      },
    ]);

    await upload(god.api, [block('k2', { offset: 60, title: 'Keywords - Google Ads' })]);
    const next = (await myDay(god.api, dayOf(60))).blocks.find(
      (b) => b.title === 'Keywords - Google Ads',
    );
    expect(next!.suggestion).toMatchObject({ initiative: { id: fge.id }, confidence: 85 });
    await god.api.me.time.blocks({ blockId: next!.id }).post({ action: 'confirm' });
    rules = (await god.api.me.time.rules.get()).data!;
    expect(rules[0]).toMatchObject({ hits: 1 });

    // Without a domain the rule is a distinctive title word; ignoring with remember makes an ignore rule.
    await upload(god.api, [
      block('k3', { offset: 120, domain: null, app: 'Slack', title: 'general - Cambray' }),
    ]);
    const slack = (await myDay(god.api, dayOf(120))).blocks.find((b) => b.app === 'Slack');
    await god.api.me.time.blocks({ blockId: slack!.id }).post({ action: 'ignore', remember: true });
    rules = (await god.api.me.time.rules.get()).data!;
    expect(rules[1]).toMatchObject({ field: 'title', pattern: 'general', ignore: true });
    await upload(god.api, [
      block('k4', { offset: 180, domain: null, app: 'Slack', title: 'general - Cambray' }),
    ]);
    const k4 = (await myDay(god.api, dayOf(180))).blocks.filter((b) => b.app === 'Slack').at(-1);
    expect(k4).toMatchObject({ status: 'ignored', suggestion: null });

    expect((await god.api.me.time.rules({ ruleId: rules[1]!.id }).delete()).status).toBe(204);
    expect((await god.api.me.time.rules.get()).data).toHaveLength(1);
    expect((await god.api.me.time.rules.post({ field: 'app', pattern: 'Slack' })).status).toBe(400);
    expect(
      (await god.api.me.time.rules.post({ field: 'app', pattern: '   ', ignore: true })).status,
    ).toBe(400);

    // A call remembers its contact.
    await upload(god.api, [
      block('k5', {
        offset: -60,
        source: 'call',
        app: 'Phone',
        domain: null,
        title: 'Call with Mark Smith',
        detail: { direction: 'out', contact: 'Mark Smith', number: '+441234' },
      }),
    ]);
    const [call] = (await myDay(god.api)).blocks;
    await god.api.me.time
      .blocks({ blockId: call!.id })
      .post({ action: 'confirm', initiativeId: fge.id, remember: true });
    expect((await god.api.me.time.rules.get()).data).toMatchObject([
      { field: 'domain' },
      { field: 'contact', pattern: 'Mark Smith', initiative: { id: fge.id } },
    ]);
  });

  it('lets a person log time only on tickets their role can edit', async () => {
    const { god } = await setup();
    const { con, todo, fge } = await scaffold(god);
    const ticket = (
      await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id })
    ).data!;
    const reader = await createRole(god.api, 'CON', {
      name: 'Reader',
      permissions: { work_items: { read: true } },
    });
    const member = await addProjectMember(god.api, 'CON', reader.data!.id);
    await upload(member, [block('k1', { title: `${ticket.identifier} Ads` })]);
    const [b] = (await myDay(member)).blocks;
    expect(b!.suggestion).toMatchObject({ issue: { id: ticket.id }, confidence: 95 });

    const blocks = member.me.time.blocks({ blockId: b!.id });
    expect((await blocks.post({ action: 'confirm' })).status).toBe(403);
    expect((await blocks.post({ action: 'confirm', issueId: ticket.id })).status).toBe(403);
    expect((await member.me.time['confirm-day'].post({ date: dayOf() })).data).toEqual({
      confirmed: 0,
    });
    expect(
      (await member.me.time.rules.post({ field: 'app', pattern: 'Chrome', issueId: ticket.id }))
        .status,
    ).toBe(403);
    expect((await god.api.issues({ issueId: ticket.id }).worklogs.get()).data).toEqual([]);
    // The initiative alone is fine: it logs nothing on a ticket.
    expect(
      (await blocks.post({ action: 'confirm', issueId: null, initiativeId: fge.id })).status,
    ).toBe(200);
  });

  it('shows a team rule only to the people who can reach its project', async () => {
    const { god } = await setup();
    const { con, fge } = await scaffold(god);
    const rule = (
      await god.api.me.time.rules.post({
        field: 'domain',
        pattern: 'ads.google',
        initiativeId: fge.id,
      })
    ).data!;
    await con.time.rules({ ruleId: rule.id }).promote.post();
    const stranger = await addUser({ name: 'Sam' });

    expect((await stranger.api.me.time.rules.get()).data).toEqual([]);
    await upload(stranger.api, [block('s1')]);
    expect((await myDay(stranger.api)).blocks[0]!.suggestion).toBeNull();

    await joinProject(god, stranger, 'CON', 'member');
    expect((await stranger.api.me.time.rules.get()).data).toMatchObject([{ id: rule.id }]);
    await upload(stranger.api, [block('s1')]);
    expect((await myDay(stranger.api)).blocks[0]!.suggestion).toMatchObject({
      initiative: { id: fge.id },
    });
  });

  it('refuses a change to a block of a closed week, unless god', async () => {
    const { god } = await setup();
    const { fge } = await scaffold(god);
    const member = await addUser({ name: 'Jo' });
    await joinProject(god, member, 'CON', 'member');
    const old = -14 * 24 * 60;
    await upload(member.api, [block('old', { offset: old })]);
    await upload(god.api, [block('old', { offset: old })]);

    const theirs = (await myDay(member.api, dayOf(old))).blocks[0]!;
    expect(theirs.locked).toBe(true);
    const blocks = member.api.me.time.blocks({ blockId: theirs.id });
    expect((await blocks.post({ action: 'confirm', initiativeId: fge.id })).status).toBe(403);
    expect(
      (await blocks.split.post({ at: new Date(base + (old + 10) * MINUTE).toISOString() })).status,
    ).toBe(403);
    expect((await blocks.capture.post({ projectKey: 'CON', title: 'x' })).status).toBe(403);

    const gods = (await myDay(god.api, dayOf(old))).blocks[0]!;
    expect(gods.locked).toBe(false);
    expect(
      (
        await god.api.me.time
          .blocks({ blockId: gods.id })
          .post({ action: 'confirm', initiativeId: fge.id })
      ).status,
    ).toBe(200);
  });

  it('confirm-day honours the confidence', async () => {
    const { god } = await setup();
    const { con, todo, started, fge } = await scaffold(god);
    const ads = (await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id }))
      .data!;
    const site = (
      await con.issues.post({ columnId: todo.id, title: 'Site', assigneeUserId: god.id })
    ).data!;
    await god.api.issues({ issueId: site.id }).patch({ columnId: started.id });
    await upload(god.api, [
      block('sure', { title: `${ads.identifier} Ads` }),
      block('maybe', { offset: 30, domain: null, app: 'Code', title: 'site.tsx' }),
      block('none', { offset: 60, domain: null, app: 'Finder', title: 'Downloads' }),
    ]);

    const first = await god.api.me.time['confirm-day'].post({ date: dayOf() });
    expect(first.data).toEqual({ confirmed: 1 });
    const second = await god.api.me.time['confirm-day'].post({ date: dayOf(), minConfidence: 50 });
    expect(second.data).toEqual({ confirmed: 2 });
    const day = await myDay(god.api);
    expect(day.blocks.map((b) => [b.status, b.issue?.id ?? null])).toEqual([
      ['confirmed', ads.id],
      ['confirmed', site.id],
      ['confirmed', site.id],
    ]);
    expect((await god.api.issues({ issueId: site.id }).worklogs.get()).data).toHaveLength(2);
  });

  it('shows the team view to owners only, and promotes a rule to the team', async () => {
    const { god } = await setup();
    const { con, fge } = await scaffold(god);
    const member = await addUser({ name: 'Jo' });
    await joinProject(god, member, 'CON', 'member');
    await member.api.time.agent.heartbeat.post({
      device: 'laptop',
      platform: 'win32',
      version: '0.1.0',
      awOk: false,
    });
    await upload(member.api, [block('k1', { minutes: 45 })], 'laptop');
    const [b] = (await myDay(member.api)).blocks;
    await member.api.me.time
      .blocks({ blockId: b!.id })
      .post({ action: 'confirm', initiativeId: fge.id });
    await upload(member.api, [block('k2', { offset: 60, minutes: 15 })], 'laptop');

    expect((await member.api.projects({ projectKey: 'CON' }).time.team.get()).status).toBe(403);
    const team = await con.time.team.get();
    expect(team.status).toBe(200);
    expect(team.data).toMatchObject([
      {
        userId: member.id,
        name: 'Jo',
        devices: [{ name: 'laptop', platform: 'win32', trackerOk: false }],
        confirmedSecondsThisWeek: 2700,
        pendingSecondsThisWeek: 900,
      },
      { userId: god.id, devices: [], confirmedSecondsThisWeek: 0, pendingSecondsThisWeek: 0 },
    ]);

    const rule = (
      await god.api.me.time.rules.post({
        field: 'domain',
        pattern: 'ads.google',
        initiativeId: fge.id,
      })
    ).data!;
    expect(
      (
        await member.api
          .projects({ projectKey: 'CON' })
          .time.rules({ ruleId: rule.id })
          .promote.post()
      ).status,
    ).toBe(403);
    const promoted = await con.time.rules({ ruleId: rule.id }).promote.post();
    expect(promoted.status).toBe(200);
    expect(promoted.data).toMatchObject({ id: rule.id, personal: false });
    expect((await con.time.rules({ ruleId: rule.id }).promote.post()).status).toBe(404);

    const theirs = (await member.api.me.time.rules.get()).data!;
    expect(theirs).toMatchObject([{ id: rule.id, personal: false }]);
    expect((await member.api.me.time.rules({ ruleId: rule.id }).delete()).status).toBe(404);
    await upload(member.api, [block('k3', { offset: 120 })], 'laptop');
    expect((await myDay(member.api)).blocks[2]!.suggestion).toMatchObject({
      initiative: { id: fge.id },
      confidence: 85,
      reason: 'Team rule: domain contains "ads.google"',
    });
  });

  it('counts confirmed blocks on the Time page', async () => {
    const { god } = await setup();
    const { con, todo, fge } = await scaffold(god);
    const ticket = (
      await con.issues.post({ columnId: todo.id, title: 'Ads', initiativeId: fge.id })
    ).data!;
    await upload(god.api, [
      block('ticket', { title: `${ticket.identifier} Ads`, minutes: 60 }),
      block('client', { offset: 60, minutes: 120 }),
      block('loose', { offset: 180, minutes: 60 }),
    ]);
    const [a, b] = (await myDay(god.api)).blocks;
    await god.api.me.time.blocks({ blockId: a!.id }).post({ action: 'confirm' });
    await god.api.me.time
      .blocks({ blockId: b!.id })
      .post({ action: 'confirm', initiativeId: fge.id });

    const month = new Date(base).toISOString().slice(0, 7);
    const time = (await con.time.get({ query: { month } })).data!;
    expect(time.clients).toEqual([
      {
        initiativeId: fge.id,
        title: fge.title,
        trackedMinutes: 180,
        limitMinutes: 300,
        state: 'flag',
      },
    ]);

    // The Playbook's limit gate reads the same minutes.
    await con.playbook.post({ initiativeId: fge.id, title: 'Ads', pricePence: 10000 });
    expect((await con.playbook.get()).data).toMatchObject([
      { initiativeId: fge.id, trackedMinutes: 180, timeState: 'flag' },
    ]);
  });

  it('prunes pending blocks after 30 days and ignored ones after 7', async () => {
    const { god } = await setup();
    await scaffold(god);
    const stale = -40 * 24 * 60;
    const week = -10 * 24 * 60;
    await upload(god.api, [
      block('stale', { offset: stale }),
      block('ignored', { offset: week }),
      block('fresh'),
    ]);
    const [ignored] = (await myDay(god.api, dayOf(week))).blocks;
    await god.api.me.time.blocks({ blockId: ignored!.id }).post({ action: 'ignore' });

    expect(await pruneBlocks()).toBe(2);
    expect((await myDay(god.api, dayOf(stale))).blocks).toEqual([]);
    expect((await myDay(god.api, dayOf(week))).blocks).toEqual([]);
    expect((await myDay(god.api)).blocks).toHaveLength(1);
  });
});
