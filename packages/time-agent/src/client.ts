import { setTimeout as sleep } from 'node:timers/promises';
import type { Block } from './transform';

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

export class PlanClient {
  private readonly fetch: Fetch;
  private readonly backoffMs: number;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    options: ClientOptions = {},
  ) {
    this.fetch = options.fetch ?? fetch;
    this.backoffMs = options.backoffMs ?? BACKOFF_MS;
  }

  // Retries a server error or a dead connection with backoff; a 401 stops at once.
  private async post<T>(path: string, body: unknown): Promise<T> {
    let lastError: Error = new Error('no attempt made');
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(this.backoffMs * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await this.fetch(`${this.url}${path}`, {
          method: 'POST',
          headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (res.status === 401) throw new AuthError();
      if (res.ok) return (await res.json()) as T;
      const text = (await res.text()).slice(0, 200);
      lastError = new RequestError(res.status, `POST ${path} failed with ${res.status}: ${text}`);
      if (res.status < 500) throw lastError;
    }
    throw lastError;
  }

  async heartbeat(beat: Heartbeat): Promise<void> {
    await this.post('/time/agent/heartbeat', beat);
  }

  async uploadBlocks(device: string, blocks: Block[]): Promise<UploadResult> {
    const total: UploadResult = { inserted: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      const result = await this.post<UploadResult>('/time/agent/blocks', {
        device,
        blocks: blocks.slice(i, i + CHUNK_SIZE),
      });
      total.inserted += result.inserted ?? 0;
      total.updated += result.updated ?? 0;
      total.skipped += result.skipped ?? 0;
    }
    return total;
  }
}
