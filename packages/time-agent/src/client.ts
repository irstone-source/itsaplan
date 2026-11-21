import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { configDir } from './config';
import type { Block } from './transform';

// Every request this program makes to Plan goes through PlanClient, and each one is
// written to sent.log first, so `plan-time sent` lists all of it.
// Payloads follow apps/api/src/modules/timecap/model.ts (heartbeatBody, uploadBlocksBody).

export type Platform = 'darwin' | 'win32' | 'linux';

export interface Heartbeat {
  device: string;
  platform: Platform;
  version: string;
  awOk: boolean;
}

export interface UploadResult {
  inserted: number;
  updated: number;
  skipped: number;
}

// A block sent from a docket carries the ticket it was worked on.
export type OutgoingBlock = Block & { issueId?: number };

export interface Issue {
  id: number;
  identifier: string;
  title: string;
  columnId: number;
  projectId: number;
}

export type IssueRef = Pick<Issue, 'id' | 'identifier'>;

export interface Column {
  id: number;
  name: string;
  stateType: string;
  position: number;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
}

// Follows createSessionDocketBody in apps/api/src/modules/dockets/model.ts.
export interface NewDocket {
  clientKey: string;
  outcome: 'complete' | 'blocked';
  evidence: string;
  body: string;
  device: string;
  sessionStartedAt: string;
  sessionEndedAt: string;
  activeSeconds: number;
  attachmentIds: string[];
}

export interface StampedDocket {
  id: number;
  number: string;
}

export const CHUNK_SIZE = 2000;
const REQUEST_TIMEOUT_MS = 30_000;
const ATTEMPTS = 4;
const BACKOFF_MS = 1000;

export class AuthError extends Error {
  constructor() {
    super('Plan rejected the API key (401) — run: plan-time setup');
  }
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: Fetch;
  backoffMs?: number;
}

export function platformOf(platform: string): Platform {
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux';
}

export function sentLogPath(): string {
  return join(configDir(), 'sent.log');
}

export async function readSentLog(): Promise<string> {
  try {
    return await readFile(sentLogPath(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

async function logSent(method: string, path: string, bytes: number, label: string) {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const line = [new Date().toISOString(), method, path, String(bytes), label].join('\t');
  await appendFile(sentLogPath(), `${line}\n`, { mode: 0o600 });
}

// "CON-158" → project key and number.
export function parseIdentifier(identifier: string): { key: string; number: number } {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(identifier.trim());
  if (!match) throw new Error(`${identifier} is not a ticket identifier like CON-158`);
  return { key: match[1].toUpperCase(), number: Number(match[2]) };
}

interface Payload {
  body?: RequestInit['body'];
  contentType?: string;
  bytes: number;
}

export class PlanClient {
  private readonly fetch: Fetch;
  private readonly backoffMs: number;

  constructor(
    readonly url: string,
    private readonly apiKey: string,
    options: ClientOptions = {},
  ) {
    this.fetch = options.fetch ?? fetch;
    this.backoffMs = options.backoffMs ?? BACKOFF_MS;
  }

  // Retries a server error or a dead connection with backoff; a 401 stops at once.
  // Each attempt is logged, because each one sends the bytes again.
  private async request<T>(
    method: string,
    path: string,
    label: string,
    payload: Payload = { bytes: 0 },
  ): Promise<T> {
    let lastError: Error = new Error('no attempt made');
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(this.backoffMs * 2 ** (attempt - 1));
      await logSent(method, path, payload.bytes, label);
      const headers: Record<string, string> = { 'x-api-key': this.apiKey };
      if (payload.contentType) headers['content-type'] = payload.contentType;
      let res: Response;
      try {
        res = await this.fetch(`${this.url}${path}`, {
          method,
          headers,
          body: payload.body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (res.status === 401) throw new AuthError();
      if (res.ok) return (await res.json()) as T;
      const text = (await res.text()).slice(0, 200);
      lastError = new RequestError(
        res.status,
        `${method} ${path} failed with ${res.status}: ${text}`,
      );
      if (res.status < 500) throw lastError;
    }
    throw lastError;
  }

  private send<T>(method: string, path: string, label: string, json: unknown): Promise<T> {
    const body = JSON.stringify(json);
    return this.request<T>(method, path, label, {
      body,
      contentType: 'application/json',
      bytes: Buffer.byteLength(body),
    });
  }

  async heartbeat(beat: Heartbeat): Promise<void> {
    await this.send('POST', '/time/agent/heartbeat', 'heartbeat', beat);
  }

  async uploadBlocks(device: string, blocks: OutgoingBlock[]): Promise<UploadResult> {
    const total: UploadResult = { inserted: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const chunk = blocks.slice(i, i + CHUNK_SIZE);
      const result = await this.send<UploadResult>(
        'POST',
        '/time/agent/blocks',
        `${chunk.length} time blocks`,
        { device, blocks: chunk },
      );
      total.inserted += result.inserted ?? 0;
      total.updated += result.updated ?? 0;
      total.skipped += result.skipped ?? 0;
    }
    return total;
  }

  async me(): Promise<{ name: string } | null> {
    const res = await this.request<{ authenticated: boolean; user?: { name: string } }>(
      'GET',
      '/me',
      'read: who am I',
    );
    return res.authenticated && res.user ? res.user : null;
  }

  async issue(identifier: string): Promise<Issue> {
    const { key, number } = parseIdentifier(identifier);
    return this.request<Issue>(
      'GET',
      `/projects/${encodeURIComponent(key)}/issues/${number}`,
      `read: ticket ${key}-${number}`,
    );
  }

  async columns(projectKey: string): Promise<Column[]> {
    const res = await this.request<{ columns: Column[] }>(
      'GET',
      `/projects/${encodeURIComponent(projectKey)}`,
      `read: columns of ${projectKey}`,
    );
    return [...res.columns].sort((a, b) => a.position - b.position);
  }

  async moveIssue(issue: IssueRef, column: Column): Promise<void> {
    await this.send('PATCH', `/issues/${issue.id}`, `move ${issue.identifier} to ${column.name}`, {
      columnId: column.id,
    });
  }

  // The form is encoded here so the log records the exact number of bytes sent.
  async uploadAttachment(
    issue: IssueRef,
    filename: string,
    contentType: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<Attachment> {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: contentType }), filename);
    const encoded = new Response(form);
    const body = new Uint8Array(await encoded.arrayBuffer());
    return this.request<Attachment>(
      'POST',
      `/issues/${issue.id}/attachments`,
      `file ${filename} for ${issue.identifier}`,
      {
        body,
        contentType: encoded.headers.get('content-type') ?? 'multipart/form-data',
        bytes: body.byteLength,
      },
    );
  }

  async createDocket(issue: IssueRef, docket: NewDocket): Promise<StampedDocket> {
    return this.send<StampedDocket>(
      'POST',
      `/issues/${issue.id}/dockets`,
      `docket for ${issue.identifier}`,
      docket,
    );
  }
}
