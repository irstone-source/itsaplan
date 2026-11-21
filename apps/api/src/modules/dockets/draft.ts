import { agentRun, agentRunTrace, aiAgent, db, issueDocket, user } from '@repo/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

const OUTPUT_LIMIT = 4000;
const FILE_LIMIT = 50;
const FILE_KEYS = new Set(['path', 'file_path', 'filePath', 'filename', 'file']);

export interface DocketRun {
  agentName: string;
  trigger: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  inputTokens: number | null;
  outputTokens: number | null;
  output: string | null;
  error: string | null;
}

interface TraceEvent {
  event: { type: string; toolCallId?: string; toolCallName?: string; delta?: string };
}

// Docket text must not mention anyone when it is posted as a person's comment. An '@'
// already followed by the zero-width space is left as it is.
export const quiet = (text: string) => text.replace(/@(?!\u200b)/g, '@\u200b');

function duration(from: Date, to: Date): string {
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

function filesIn(args: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  return Object.entries(parsed as Record<string, unknown>)
    .filter(([key, value]) => FILE_KEYS.has(key) && typeof value === 'string' && value !== '')
    .map(([, value]) => value as string);
}

// Tool names with their call counts, and the file paths named in the calls' arguments.
export function summariseTrace(events: TraceEvent[]): {
  tools: [string, number][];
  files: string[];
} {
  const counts = new Map<string, number>();
  const args = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === 'TOOL_CALL_START' && event.toolCallName) {
      counts.set(event.toolCallName, (counts.get(event.toolCallName) ?? 0) + 1);
    } else if (event.type === 'TOOL_CALL_ARGS' && event.toolCallId) {
      args.set(event.toolCallId, (args.get(event.toolCallId) ?? '') + (event.delta ?? ''));
    }
  }
  const files = new Set<string>();
  for (const text of args.values()) for (const file of filesIn(text)) files.add(file);
  return { tools: [...counts.entries()], files: [...files] };
}

export function docketBody(run: DocketRun, events: TraceEvent[]): string {
  const { tools, files } = summariseTrace(events);
  const lines = [`**Agent run docket: ${quiet(run.agentName)}**`, ''];
  lines.push(`- Trigger: ${run.trigger}`, `- Status: ${run.status}`);
  if (run.startedAt) lines.push(`- Started: ${run.startedAt.toISOString()}`);
  if (run.finishedAt) lines.push(`- Finished: ${run.finishedAt.toISOString()}`);
  if (run.startedAt && run.finishedAt) {
    lines.push(`- Duration: ${duration(run.startedAt, run.finishedAt)}`);
  }
  if (run.inputTokens != null || run.outputTokens != null) {
    lines.push(`- Tokens: ${run.inputTokens ?? 0} in, ${run.outputTokens ?? 0} out`);
  }
  if (run.error) lines.push(`- Error: ${quiet(run.error)}`);
  if (tools.length > 0) {
    const total = tools.reduce((n, [, count]) => n + count, 0);
    lines.push('', `**Tool calls (${total})**`, '');
    for (const [name, count] of tools) lines.push(`- ${quiet(name)}: ${count}`);
  }
  if (files.length > 0) {
    lines.push('', '**Files touched**', '');
    for (const file of files.slice(0, FILE_LIMIT)) lines.push(`- ${quiet(file)}`);
    if (files.length > FILE_LIMIT) lines.push(`- and ${files.length - FILE_LIMIT} more`);
  }
  const output = run.output?.trim();
  if (output) {
    const cut = output.length > OUTPUT_LIMIT;
    lines.push('', '**Output**', '', quiet(cut ? `${output.slice(0, OUTPUT_LIMIT)}…` : output));
    if (cut) lines.push('', `_Output cut at ${OUTPUT_LIMIT} of ${output.length} characters._`);
  }
  return lines.join('\n');
}

// A draft docket for each finished run of an issue. A failure here is logged and never
// fails the run's completion.
export async function draftRunDockets(runIds: number[]): Promise<void> {
  if (runIds.length === 0) return;
  try {
    const runs = await db
      .select({
        id: agentRun.id,
        issueId: agentRun.issueId,
        agentName: user.name,
        trigger: agentRun.trigger,
        status: agentRun.status,
        startedAt: agentRun.startedAt,
        finishedAt: agentRun.finishedAt,
        inputTokens: agentRun.inputTokens,
        outputTokens: agentRun.outputTokens,
        output: agentRun.output,
        error: agentRun.lastError,
        attempts: agentRun.attempts,
      })
      .from(agentRun)
      .innerJoin(aiAgent, eq(aiAgent.id, agentRun.agentId))
      .innerJoin(user, eq(user.id, aiAgent.userId))
      .where(and(inArray(agentRun.id, runIds), isNotNull(agentRun.issueId)));
    for (const run of runs) {
      const [trace] = await db
        .select({ events: agentRunTrace.events })
        .from(agentRunTrace)
        .where(and(eq(agentRunTrace.runId, run.id), eq(agentRunTrace.attempt, run.attempts)));
      await db.insert(issueDocket).values({
        issueId: run.issueId!,
        agentRunId: run.id,
        body: docketBody(run, (trace?.events ?? []) as TraceEvent[]),
      });
    }
  } catch (error) {
    console.error('[dockets] drafting a run docket failed:', error);
  }
}
