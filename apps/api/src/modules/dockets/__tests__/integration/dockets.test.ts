import { beforeEach, describe, expect, it } from 'bun:test';
import { authedApi, apiKeyApi, createProject, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';
import { createAgent } from '#tests/helpers/agents';
import { createRole } from '#tests/helpers/roles';
import { addProjectMember } from '#tests/helpers/members';

const events = [
  { type: 'TOOL_CALL_START' as const, toolCallId: 't1', toolCallName: 'edit' },
  { type: 'TOOL_CALL_ARGS' as const, toolCallId: 't1', delta: '{"path":"src/a.ts"}' },
  { type: 'TOOL_CALL_START' as const, toolCallId: 't2', toolCallName: 'edit' },
  { type: 'TOOL_CALL_ARGS' as const, toolCallId: 't2', delta: '{"path":' },
  { type: 'TOOL_CALL_ARGS' as const, toolCallId: 't2', delta: '"src/b.ts"}' },
  { type: 'TOOL_CALL_START' as const, toolCallId: 't3', toolCallName: 'shell' },
];

// An external agent's run of an issue, reported finished through the runner routes.
async function finishedRun() {
  const owner = await signUpTestUser();
  const api = authedApi(owner.cookie);
  await createProject(api, { key: 'RUN', name: 'Runs' });
  const project = (await api.projects({ projectKey: 'RUN' }).get()).data!;
  const agent = (
    await createAgent(api, 'RUN', {
      name: 'Runner',
      username: 'runner',
      kind: 'external',
      triggerOnMention: true,
    })
  ).data!;
  const runner = apiKeyApi(agent.apiKey!);
  const issue = (
    await api
      .projects({ projectKey: 'RUN' })
      .issues.post({ title: 'Fix it', columnId: project.columns[0].id })
  ).data!;
  await api.issues({ issueId: issue.id }).comments.post({ body: '@runner fix it' });
  const run = (await runner['agent-runs'].claim.post()).data!.run!;
  await runner['agent-runs']({ runId: run.id }).events.post({ attempt: 1, offset: 0, events });
  const result = await runner['agent-runs']({ runId: run.id }).result.post({
    status: 'success',
    output: 'Fixed both files. Over to @runner.',
    usage: { inputTokens: 1200, outputTokens: 300 },
  });
  expect(result.status).toBe(204);
  return { api, runner, issue, run };
}

async function comments(api: Api, issueId: number) {
  const res = await api.issues({ issueId }).feed.get({ query: { filter: 'comments' } });
  return res.data!.items;
}

describe('agent run dockets', () => {
  beforeEach(resetDb);

  it('drafts a docket when a run of an issue ends', async () => {
    const { api, issue, run } = await finishedRun();
    const res = await api.issues({ issueId: issue.id }).dockets.get();
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(1);
    const docket = res.data![0]!;
    expect(docket).toMatchObject({
      issueId: issue.id,
      agentRunId: run.id,
      status: 'draft',
      decidedByUserId: null,
      decidedAt: null,
    });
    expect(docket.body).toContain('Agent run docket: Runner');
    expect(docket.body).toContain('- Status: success');
    expect(docket.body).toContain('- Tokens: 1200 in, 300 out');
    expect(docket.body).toContain('**Tool calls (3)**');
    expect(docket.body).toContain('- edit: 2');
    expect(docket.body).toContain('- shell: 1');
    expect(docket.body).toContain('- src/a.ts\n- src/b.ts');
    expect(docket.body).toContain('Fixed both files.');
    // Only the person's @runner comment is on the issue until the docket is attached.
    expect(await comments(api, issue.id)).toHaveLength(1);
  }, 20_000);

  it('attach writes one comment by the person; a second decision is 409', async () => {
    const { api, runner, issue } = await finishedRun();
    const [docket] = (await api.issues({ issueId: issue.id }).dockets.get()).data!;
    const attached = await api.dockets({ docketId: docket!.id }).attach.post();
    expect(attached.status).toBe(200);
    expect(attached.data).toMatchObject({
      status: 'attached',
      decidedByUserId: expect.any(String),
    });
    expect(attached.data!.decidedAt).toBeInstanceOf(Date);
    const items = await comments(api, issue.id);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'comment', body: docket!.body });
    // The agent's own @handle in its output does not start another run.
    expect((await runner['agent-runs'].claim.post()).data!.run).toBeNull();

    expect((await api.dockets({ docketId: docket!.id }).attach.post()).status).toBe(409);
    expect((await api.dockets({ docketId: docket!.id }).discard.post()).status).toBe(409);
    expect(await comments(api, issue.id)).toHaveLength(2);
  }, 20_000);

  it('discard writes no comment', async () => {
    const { api, issue } = await finishedRun();
    const [docket] = (await api.issues({ issueId: issue.id }).dockets.get()).data!;
    const discarded = await api.dockets({ docketId: docket!.id }).discard.post();
    expect(discarded.status).toBe(200);
    expect(discarded.data!.status).toBe('discarded');
    expect(await comments(api, issue.id)).toHaveLength(1);
    expect((await api.dockets({ docketId: docket!.id }).attach.post()).status).toBe(409);
    expect((await api.issues({ issueId: issue.id }).dockets.get()).data![0]!.status).toBe(
      'discarded',
    );
  }, 20_000);

  it('keeps dockets from a reader and a non-member', async () => {
    const { api, issue } = await finishedRun();
    const [docket] = (await api.issues({ issueId: issue.id }).dockets.get()).data!;
    const role = (
      await createRole(api, 'RUN', { name: 'Reader', permissions: { work_items: { read: true } } })
    ).data!;
    const reader = await addProjectMember(api, 'RUN', role.id);
    expect((await reader.issues({ issueId: issue.id }).dockets.get()).status).toBe(403);
    expect((await reader.dockets({ docketId: docket!.id }).attach.post()).status).toBe(403);
    expect((await reader.dockets({ docketId: docket!.id }).discard.post()).status).toBe(403);

    const stranger = authedApi((await signUpTestUser()).cookie);
    expect((await stranger.issues({ issueId: issue.id }).dockets.get()).status).toBe(403);
    expect((await stranger.dockets({ docketId: docket!.id }).attach.post()).status).toBe(403);
    expect((await api.dockets({ docketId: docket!.id + 1000 }).attach.post()).status).toBe(404);
    expect((await api.issues({ issueId: issue.id }).dockets.get()).data![0]!.status).toBe('draft');
  }, 20_000);
});
