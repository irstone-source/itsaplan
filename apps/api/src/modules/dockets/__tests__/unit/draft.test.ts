import { describe, expect, it } from 'bun:test';
import { docketBody, type DocketRun } from '../../draft';

const run: DocketRun = {
  agentName: 'Runner',
  trigger: 'mention',
  status: 'failed',
  startedAt: new Date('2026-11-21T10:00:00Z'),
  finishedAt: new Date('2026-11-21T10:04:12Z'),
  inputTokens: null,
  outputTokens: null,
  output: null,
  error: 'Ask @ian',
};

describe('docketBody', () => {
  it('states the run and leaves out what it does not have', () => {
    const body = docketBody(run, []);
    expect(body).toContain('- Duration: 4m 12s');
    expect(body).not.toContain('Tokens');
    expect(body).not.toContain('Tool calls');
    expect(body).not.toContain('Output');
  });

  it('keeps agent text from mentioning anyone', () => {
    expect(docketBody(run, [])).toContain('Ask @​ian');
  });

  it('cuts a long output and ignores arguments that are not JSON', () => {
    const body = docketBody({ ...run, output: 'x'.repeat(5000) }, [
      { event: { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'read' } },
      { event: { type: 'TOOL_CALL_ARGS', toolCallId: 'a', delta: 'not json' } },
    ]);
    expect(body).toContain(`${'x'.repeat(4000)}…`);
    expect(body).toContain('Output cut at 4000 of 5000 characters');
    expect(body).not.toContain('Files touched');
  });
});
