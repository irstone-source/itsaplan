import { beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { db, issueActivity, issueAttachment, issueDocket, issueLabel } from '@repo/db';
import { eq } from 'drizzle-orm';
import { authedApi, apiKeyApi, createProject, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { createAgent } from '#tests/helpers/agents';
import { createRole } from '#tests/helpers/roles';
import { addProjectMember } from '#tests/helpers/members';
import { londonDate } from '#modules/timecap/london';

// The configured object store when it answers; otherwise an in-memory one, so the
// attachment hashing runs on a machine without S3.
async function storeAnswers(): Promise<boolean> {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return false;
  try {
    await fetch(endpoint, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

const fakeStore = !(await storeAnswers());
if (fakeStore) {
  const objects = new Map<string, { body: Uint8Array; type: string }>();
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const key = new URL(req.url).pathname;
      if (key.includes('boom')) return new Response('', { status: 500 });
      if (req.method === 'PUT') {
        const body = new Uint8Array(await req.arrayBuffer());
        objects.set(key, {
          body,
          type: req.headers.get('content-type') ?? 'application/octet-stream',
        });
        return new Response('', {
          headers: { ETag: `"${createHash('md5').update(body).digest('hex')}"` },
        });
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        return new Response(null, { status: 204 });
      }
      const object = objects.get(key);
      if (!object) {
        return new Response('<Error><Code>NoSuchKey</Code></Error>', {
          status: 404,
          headers: { 'content-type': 'application/xml' },
        });
      }
      return new Response(object.body, {
        headers: {
          'content-type': object.type,
          'content-length': String(object.body.length),
          ETag: `"${createHash('md5').update(object.body).digest('hex')}"`,
        },
      });
    },
  });
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${server.port}`,
    S3_BUCKET: 'test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
  });
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function setup() {
  await signUpTestUser();
  const ownerUser = await signUpTestUser();
  const owner = authedApi(ownerUser.cookie);
  await createProject(owner, { key: 'CON', name: 'Consulting' });
  const project = (await owner.projects({ projectKey: 'CON' }).get()).data!;
  const column = (type: string) => project.columns.find((c) => c.stateType === type)!.id;
  const newIssue = async (title: string) =>
    (
      await owner
        .projects({ projectKey: 'CON' })
        .issues.post({ title, columnId: column('unstarted') })
    ).data!;
  const issue = await newIssue('Build it');
  const member = await addProjectMember(owner, 'CON');
  return { owner, ownerUser, column, newIssue, issue, member };
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

function sessionBody(over: Record<string, unknown> = {}) {
  return {
    clientKey: 'CON-1-1700000000000',
    outcome: 'complete' as const,
    evidence: 'Shipped it, see the screenshot.',
    body: '## Evidence docket: CON-1\n\n- Who: Ian',
    device: 'mac',
    sessionStartedAt: hoursAgo(2),
    sessionEndedAt: hoursAgo(1),
    activeSeconds: 3000,
    attachmentIds: [] as string[],
    ...over,
  };
}

async function upload(client: Api, issueId: number, name: string, content: string) {
  const res = await client.issues({ issueId }).attachments.post({
    file: new File([content], name, { type: 'image/png' }),
  });
  expect(res.status).toBe(201);
  return res.data!.id;
}

async function comments(client: Api, issueId: number) {
  return (await client.issues({ issueId }).feed.get({ query: { filter: 'comments' } })).data!.items;
}

async function issueOf(client: Api, issueId: number) {
  return (await client.issues({ issueId }).get()).data!;
}

describe('session dockets', () => {
  beforeEach(resetDb);

  it('stamps, numbers, hashes the attachments and posts the comment once', async () => {
    const { owner, member, issue, newIssue } = await setup();
    const shot = await upload(member, issue.id, 'shot.png', 'pixels');
    const md = await upload(member, issue.id, 'docket.md', '# docket');
    const created = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ attachmentIds: [shot, md] }));
    expect(created.status).toBe(201);
    const docket = created.data!;
    expect(docket).toMatchObject({
      number: 'D-CON-1-001',
      kind: 'session',
      status: 'attached',
      outcome: 'complete',
      evidence: 'Shipped it, see the screenshot.',
      issue: { id: issue.id, identifier: 'CON-1', title: 'Build it', projectKey: 'CON' },
      client: null,
      author: { name: expect.any(String) },
      device: 'mac',
      activeSeconds: 3000,
      reviewStatus: 'pending',
      reviewer: null,
      canReview: false,
    });
    expect(docket.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(docket.stampedAt).toBeInstanceOf(Date);
    expect(docket.attachments).toEqual([
      {
        publicId: shot,
        filename: 'shot.png',
        contentType: expect.stringContaining('image/png'),
        bytes: 6,
        sha256: sha('pixels'),
        url: `/attachments/${shot}/raw`,
      },
      expect.objectContaining({ publicId: md, sha256: sha('# docket') }),
    ]);

    const posted = await comments(owner, issue.id);
    expect(posted).toHaveLength(1);
    const body = posted[0]!.body!;
    expect(body).toMatch(
      new RegExp(
        `^\\*\\*Evidence docket \`D-CON-1-001\`\\*\\* · stamped \\d{1,2} \\w{3} \\d{4} \\d{2}:\\d{2} UK \\(\\d{2}:\\d{2} UTC\\) · Complete — pending review · \\[Open docket\\]\\(/docket/${docket.id}\\)\n\n## Evidence docket: CON-1`,
      ),
    );

    // The same clientKey returns the same docket and posts nothing more.
    const again = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ attachmentIds: [shot, md], evidence: 'other' }));
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ id: docket.id, number: 'D-CON-1-001' });
    expect(await comments(owner, issue.id)).toHaveLength(1);

    const second = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ clientKey: 'CON-1-2' }));
    expect(second.data!.number).toBe('D-CON-1-002');
    const other = await newIssue('Other');
    const first = await member
      .issues({ issueId: other.id })
      .dockets.post(sessionBody({ clientKey: 'CON-1-2' }));
    expect(first.data!.number).toBe('D-CON-2-001');
  });

  it('refuses an attachment from another issue, a bad time range and a reader', async () => {
    const { owner, member, issue, newIssue } = await setup();
    const elsewhere = await newIssue('Elsewhere');
    const foreign = await upload(member, elsewhere.id, 'shot.png', 'x');
    const res = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ attachmentIds: [foreign] }));
    expect(res.status).toBe(400);
    const backwards = await member.issues({ issueId: issue.id }).dockets.post(
      sessionBody({
        sessionStartedAt: '2026-11-21T11:00:00.000Z',
        sessionEndedAt: '2026-11-21T10:00:00.000Z',
      }),
    );
    expect(backwards.status).toBe(400);
    const blank = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ evidence: '   ' }));
    expect(blank.status).toBe(400);

    const role = (
      await createRole(owner, 'CON', {
        name: 'Reader',
        permissions: { work_items: { read: true } },
      })
    ).data!;
    const reader = await addProjectMember(owner, 'CON', role.id);
    expect((await reader.issues({ issueId: issue.id }).dockets.post(sessionBody())).status).toBe(
      403,
    );
    expect(await comments(owner, issue.id)).toHaveLength(0);
  });

  it('never mentions anyone from the docket text', async () => {
    const { owner, member, issue } = await setup();
    const agent = (
      await createAgent(owner, 'CON', {
        name: 'Runner',
        username: 'runner',
        kind: 'external',
        triggerOnMention: true,
      })
    ).data!;
    await member
      .issues({ issueId: issue.id })
      .dockets.post(
        sessionBody({ evidence: 'Over to @runner', body: 'Done. @runner please check.' }),
      );
    const [comment] = await comments(owner, issue.id);
    expect(comment!.body).toContain('@\u200brunner please check');
    expect(comment!.body).not.toMatch(/@runner/);
    expect((await apiKeyApi(agent.apiKey!)['agent-runs'].claim.post()).data!.run).toBeNull();
  });
});

describe('verify', () => {
  beforeEach(resetDb);

  it('reports a replaced attachment and a body edited in the database', async () => {
    const { member, issue } = await setup();
    const shot = await upload(member, issue.id, 'shot.png', 'before');
    const docket = (
      await member
        .issues({ issueId: issue.id })
        .dockets.post(sessionBody({ attachmentIds: [shot] }))
    ).data!;
    const ok = await member.dockets({ docketId: docket.id }).verify.get();
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ status: 'verified', problems: [] });
    expect(ok.data!.checkedAt).toBeInstanceOf(Date);

    await member.attachments({ publicId: shot }).put({
      file: new File(['after'], 'shot.png', { type: 'image/png' }),
    });
    const replaced = (await member.dockets({ docketId: docket.id }).verify.get()).data!;
    expect(replaced.status).toBe('changed');
    expect(replaced.problems).toEqual([`Attachment shot.png (${shot}) changed`]);

    await db.update(issueDocket).set({ body: 'tampered' }).where(eq(issueDocket.id, docket.id));
    const edited = (await member.dockets({ docketId: docket.id }).verify.get()).data!;
    expect(edited.problems).toContain('The docket body or details changed since stamping');

    await member.attachments({ publicId: shot }).delete();
    const gone = (await member.dockets({ docketId: docket.id }).verify.get()).data!;
    expect(gone.problems).toContain(`Attachment shot.png (${shot}) is missing`);
  });
});

describe('review', () => {
  beforeEach(resetDb);

  it('lets only a lead review; approve moves to done, a second review is 409', async () => {
    const { owner, member, issue, column } = await setup();
    const docket = (await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    expect(
      (await member.dockets({ docketId: docket.id }).review.post({ decision: 'approve' })).status,
    ).toBe(403);
    expect((await owner.dockets({ docketId: docket.id }).get()).data!.canReview).toBe(true);
    expect((await member.dockets({ docketId: docket.id }).get()).data!.canReview).toBe(false);

    const approved = await owner
      .dockets({ docketId: docket.id })
      .review.post({ decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.data).toMatchObject({
      reviewStatus: 'approved',
      moved: true,
      reviewer: { name: expect.any(String) },
      reviewNote: null,
      canReview: false,
    });
    expect(approved.data!.reviewedAt).toBeInstanceOf(Date);
    expect((await issueOf(owner, issue.id)).columnId).toBe(column('completed'));
    const [latest] = await comments(owner, issue.id);
    expect(latest!.body).toContain('**Evidence docket `D-CON-1-001`** · Approved by');

    const twice = await owner
      .dockets({ docketId: docket.id })
      .review.post({ decision: 'return', note: 'x' });
    expect(twice.status).toBe(409);
    const inbox = (await member.notifications.get({ query: {} })).data!.items;
    expect(inbox.some((n) => n.type === 'commented' && n.issueId === issue.id)).toBe(true);
  });

  it('a lead role reviews; return needs a note and moves the issue back to started', async () => {
    const { owner, member, issue, column } = await setup();
    const role = (
      await createRole(owner, 'CON', {
        name: 'Lead',
        permissions: { work_items: { read: true }, workflow_config: { read: true, edit: true } },
      })
    ).data!;
    const lead = await addProjectMember(owner, 'CON', role.id);
    const docket = (await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    const noNote = await lead.dockets({ docketId: docket.id }).review.post({ decision: 'return' });
    expect(noNote.status).toBe(400);
    const blankNote = await lead
      .dockets({ docketId: docket.id })
      .review.post({ decision: 'return', note: '  ' });
    expect(blankNote.status).toBe(400);
    const returned = await lead
      .dockets({ docketId: docket.id })
      .review.post({ decision: 'return', note: 'No @screenshot of the result' });
    expect(returned.status).toBe(200);
    expect(returned.data).toMatchObject({
      reviewStatus: 'returned',
      reviewNote: 'No @screenshot of the result',
    });
    expect((await issueOf(owner, issue.id)).columnId).toBe(column('started'));
    const [latest] = await comments(owner, issue.id);
    expect(latest!.body).toContain('Returned by');
    expect(latest!.body).toContain(': No @\u200bscreenshot of the result');
  });

  it('a blocked docket is not reviewable', async () => {
    const { owner, member, issue } = await setup();
    const docket = (
      await member.issues({ issueId: issue.id }).dockets.post(sessionBody({ outcome: 'blocked' }))
    ).data!;
    expect(docket.reviewStatus).toBeNull();
    expect(
      (await owner.dockets({ docketId: docket.id }).review.post({ decision: 'approve' })).status,
    ).toBe(409);
  });
});

describe('blocked dockets', () => {
  beforeEach(resetDb);

  it('tells the assignee and the leads, labels the issue at risk, and approval clears it', async () => {
    const { owner, member, issue } = await setup();
    const role = (
      await createRole(owner, 'CON', {
        name: 'Lead',
        permissions: { work_items: { read: true }, workflow_config: { read: true, edit: true } },
      })
    ).data!;
    const lead = await addProjectMember(owner, 'CON', role.id);
    const assignee = await addProjectMember(owner, 'CON');
    const assigneeId = (await assignee.me.get()).data!;
    if (!assigneeId.authenticated) throw new Error('not signed in');
    await owner.issues({ issueId: issue.id }).patch({ assigneeUserId: assigneeId.user.id });

    const blocked = await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ outcome: 'blocked', evidence: 'Waiting on Chris' }));
    expect(blocked.data).toMatchObject({ outcome: 'blocked', reviewStatus: null });
    expect((await comments(owner, issue.id))[0]!.body).toContain(' · Blocked · ');

    const told = async (client: Api) =>
      (await client.notifications.get({ query: { types: 'commented' } })).data!.items.some(
        (n) => n.issueId === issue.id,
      );
    expect(await told(lead)).toBe(true);
    expect(await told(assignee)).toBe(true);

    const labels = (await owner.projects({ projectKey: 'CON' }).get()).data!.labels;
    const atRisk = labels.find((l) => l.name === 'At risk')!;
    expect(atRisk).toBeDefined();
    expect((await issueOf(owner, issue.id)).labelIds).toEqual([atRisk.id]);

    // A second blocked docket reuses the label.
    await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ clientKey: 'b2', outcome: 'blocked' }));
    expect(
      (await owner.projects({ projectKey: 'CON' }).get()).data!.labels.filter(
        (l) => l.name === 'At risk',
      ),
    ).toHaveLength(1);

    const complete = (
      await member.issues({ issueId: issue.id }).dockets.post(sessionBody({ clientKey: 'c3' }))
    ).data!;
    await owner.dockets({ docketId: complete.id }).review.post({ decision: 'approve' });
    expect((await issueOf(owner, issue.id)).labelIds).toEqual([]);
  });

  it('approving a docket older than a blocked one keeps the label', async () => {
    const { owner, member, issue } = await setup();
    const complete = (await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    await member
      .issues({ issueId: issue.id })
      .dockets.post(sessionBody({ clientKey: 'b2', outcome: 'blocked' }));
    await owner.dockets({ docketId: complete.id }).review.post({ decision: 'approve' });
    expect((await issueOf(owner, issue.id)).labelIds).toHaveLength(1);
  });
});

describe('register', () => {
  beforeEach(resetDb);

  it('lists the stamped dockets of a month with filters and counts', async () => {
    const { owner, member, issue, newIssue } = await setup();
    const client = (await owner.projects({ projectKey: 'CON' }).initiatives.post({ title: 'GSG' }))
      .data!;
    const billed = await newIssue('Billed');
    await owner.issues({ issueId: billed.id }).patch({ initiativeId: client.id });
    const post = (issueId: number, over: Record<string, unknown>) =>
      member.issues({ issueId }).dockets.post(sessionBody(over));
    const approved = (await post(issue.id, { clientKey: 'a' })).data!;
    await owner.dockets({ docketId: approved.id }).review.post({ decision: 'approve' });
    const returned = (await post(issue.id, { clientKey: 'r' })).data!;
    await owner.dockets({ docketId: returned.id }).review.post({ decision: 'return', note: 'no' });
    await post(billed.id, { clientKey: 'p' });
    await post(billed.id, { clientKey: 'b', outcome: 'blocked' });
    const old = (await post(issue.id, { clientKey: 'old' })).data!;
    await db
      .update(issueDocket)
      .set({ stampedAt: new Date('2026-01-15T12:00:00Z') })
      .where(eq(issueDocket.id, old.id));

    const month = londonDate(new Date()).slice(0, 7);
    const register = (query: Record<string, string | number>) =>
      member.projects({ projectKey: 'CON' }).dockets.get({ query: { month, ...query } });
    const all = await register({});
    expect(all.status).toBe(200);
    expect(all.data!.items.map((d) => d.number)).toEqual([
      'D-CON-2-002',
      'D-CON-2-001',
      'D-CON-1-002',
      'D-CON-1-001',
    ]);
    expect(all.data!.items[0]).toMatchObject({
      body: '',
      attachments: [],
      client: { name: 'GSG' },
    });
    expect(all.data!.counts).toEqual({ approved: 1, pending: 1, blocked: 1, returned: 1 });

    expect((await register({ outcome: 'blocked' })).data!.items.map((d) => d.number)).toEqual([
      'D-CON-2-002',
    ]);
    expect((await register({ review: 'returned' })).data!.items.map((d) => d.number)).toEqual([
      'D-CON-1-002',
    ]);
    const forClient = (await register({ initiativeId: client.id })).data!;
    expect(forClient.items).toHaveLength(2);
    expect(forClient.counts).toEqual({ approved: 0, pending: 1, blocked: 1, returned: 0 });
    const january = await member
      .projects({ projectKey: 'CON' })
      .dockets.get({ query: { month: '2026-01' } });
    expect(january.data!.items.map((d) => d.number)).toEqual(['D-CON-1-003']);
    expect(
      (await member.projects({ projectKey: 'CON' }).dockets.get({ query: { month: '2026-13' } }))
        .status,
    ).toBe(400);

    const stranger = authedApi((await signUpTestUser()).cookie);
    expect((await stranger.projects({ projectKey: 'CON' }).dockets.get({ query: {} })).status).toBe(
      403,
    );
  });
});

describe('hardening', () => {
  beforeEach(resetDb);

  it('refuses to edit or delete a docket comment, and verify sees an edit made around it', async () => {
    const { owner, member, issue } = await setup();
    const docket = (await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    const [comment] = await comments(owner, issue.id);
    for (const client of [member, owner]) {
      const edit = await client.comments({ commentId: comment!.id }).patch({ body: 'changed' });
      expect(edit.status).toBe(409);
      expect((await client.comments({ commentId: comment!.id }).delete()).status).toBe(409);
    }
    // An ordinary comment is still editable.
    const plain = (await member.issues({ issueId: issue.id }).comments.post({ body: 'hi' })).data!;
    expect((await member.comments({ commentId: plain.id }).patch({ body: 'hello' })).status).toBe(
      200,
    );

    expect((await member.dockets({ docketId: docket.id }).verify.get()).data!.status).toBe(
      'verified',
    );
    await db
      .update(issueActivity)
      .set({ body: 'rewritten' })
      .where(eq(issueActivity.id, comment!.id));
    expect((await member.dockets({ docketId: docket.id }).verify.get()).data!.problems).toEqual([
      'The posted comment was edited or deleted',
    ]);
  });

  it('keeps an author from reviewing their own docket', async () => {
    const { owner, member, issue } = await setup();
    const own = (await owner.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    expect(own.canReview).toBe(false);
    const res = await owner.dockets({ docketId: own.id }).review.post({ decision: 'approve' });
    expect(res.status).toBe(403);
    expect((await member.dockets({ docketId: own.id }).get()).data!.reviewStatus).toBe('pending');
  });

  it('ties a clientKey to its author and checks the session times', async () => {
    const { owner, member, issue } = await setup();
    expect((await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).status).toBe(
      201,
    );
    expect((await owner.issues({ issueId: issue.id }).dockets.post(sessionBody())).status).toBe(
      409,
    );
    const post = (over: Record<string, unknown>) =>
      member.issues({ issueId: issue.id }).dockets.post(sessionBody({ clientKey: 'k2', ...over }));
    expect((await post({ sessionEndedAt: hoursAgo(-1) })).status).toBe(400);
    expect((await post({ sessionStartedAt: hoursAgo(24 * 31) })).status).toBe(400);
    expect((await post({ activeSeconds: 3602 })).status).toBe(400);
    expect((await post({ activeSeconds: 3601 })).status).toBe(201);
  });

  it('a repeat finishes a blocked docket whose flagging failed, without a second comment', async () => {
    const { owner, member, issue } = await setup();
    const body = sessionBody({ outcome: 'blocked' });
    const docket = (await member.issues({ issueId: issue.id }).dockets.post(body)).data!;
    await db.delete(issueLabel).where(eq(issueLabel.issueId, issue.id));
    await db.update(issueDocket).set({ flaggedAt: null }).where(eq(issueDocket.id, docket.id));

    const again = await member.issues({ issueId: issue.id }).dockets.post(body);
    expect(again.status).toBe(200);
    expect((await issueOf(owner, issue.id)).labelIds).toHaveLength(1);
    expect(await comments(owner, issue.id)).toHaveLength(1);
    await member.issues({ issueId: issue.id }).dockets.post(body);
    expect(await comments(owner, issue.id)).toHaveLength(1);
  });

  it('says when a review could not move the ticket', async () => {
    const { owner, member, issue, newIssue, column } = await setup();
    await owner
      .projects({ projectKey: 'CON' })
      .columns({ columnId: column('completed') })
      .patch({ wipLimit: 1, wipMode: 'hard' });
    const other = await newIssue('Already done');
    await owner.issues({ issueId: other.id }).patch({ columnId: column('completed') });
    const docket = (await member.issues({ issueId: issue.id }).dockets.post(sessionBody())).data!;
    const res = await owner.dockets({ docketId: docket.id }).review.post({ decision: 'approve' });
    expect(res.data).toMatchObject({ reviewStatus: 'approved', moved: false });
    expect((await issueOf(owner, issue.id)).columnId).toBe(column('unstarted'));
    expect((await comments(owner, issue.id))[0]!.body).toContain(
      '(ticket not moved: the column is at its WIP limit)',
    );
  });

  it('tells a missing attachment from a store that cannot be read', async () => {
    const { member, issue } = await setup();
    const shot = await upload(member, issue.id, 'shot.png', 'pixels');
    const docket = (
      await member
        .issues({ issueId: issue.id })
        .dockets.post(sessionBody({ attachmentIds: [shot] }))
    ).data!;
    const setKey = (s3Key: string) =>
      db.update(issueAttachment).set({ s3Key }).where(eq(issueAttachment.publicId, shot));
    await setKey('projects/0/gone.png');
    expect((await member.dockets({ docketId: docket.id }).verify.get()).data!.problems).toEqual([
      `Attachment shot.png (${shot}) is missing`,
    ]);
    if (fakeStore) {
      await setKey('projects/0/boom.png');
      expect((await member.dockets({ docketId: docket.id }).verify.get()).status).toBe(502);
    }
  });

  it('stores a session body that loads nothing from elsewhere and mentions no one', async () => {
    const { owner, member, issue } = await setup();
    const shot = await upload(member, issue.id, 'shot.png', 'pixels');
    const ours = `![shot.png](/media/attachments/${shot}/raw)`;
    const evil = '![x](https://evil/x.gif) <img src=x> @zak ![[ref]] \\<b>';
    const docket = (
      await member
        .issues({ issueId: issue.id })
        .dockets.post(sessionBody({ body: `${evil}\n\n${ours}`, attachmentIds: [shot] }))
    ).data!;
    expect(docket.body).toContain(ours);
    const live = docket.body.replace(ours, '').replace(/\\[\s\S]/g, '');
    expect(live).not.toMatch(/!\[|<|@(?!\u200b)/);
    expect(docket.body).toContain('@\u200bzak');
    const [comment] = await comments(owner, issue.id);
    expect(comment!.body).toContain(docket.body);
  });
});
