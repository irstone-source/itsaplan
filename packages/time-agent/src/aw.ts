import type { AwEvent } from './transform';

export const AW_URL = 'http://localhost:5600/api/0';

export interface AwBucket {
  id: string;
  type: string;
  hostname?: string;
}

const TIMEOUT_MS = 30_000;

export class ActivityWatch {
  constructor(private readonly base = AW_URL) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ActivityWatch GET ${path} failed with ${res.status}`);
    return (await res.json()) as T;
  }

  async ok(): Promise<boolean> {
    try {
      await this.get('/info');
      return true;
    } catch {
      return false;
    }
  }

  async buckets(): Promise<AwBucket[]> {
    const map = await this.get<Record<string, AwBucket>>('/buckets');
    return Object.values(map);
  }

  // Every event that overlaps [start, end], whole: ActivityWatch does not clip them.
  async events(bucketId: string, start: Date, end: Date): Promise<AwEvent[]> {
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    return this.get<AwEvent[]>(`/buckets/${encodeURIComponent(bucketId)}/events?${query}`);
  }
}

export function isWindowBucket(id: string): boolean {
  return id.startsWith('aw-watcher-window_');
}

export function isAfkBucket(id: string): boolean {
  return id.startsWith('aw-watcher-afk_');
}

export function isWebBucket(id: string): boolean {
  return id.startsWith('aw-watcher-web-');
}

// The AFK bucket of the same host as the window bucket, else any AFK bucket.
export function afkBucketFor(windowId: string, buckets: AwBucket[]): AwBucket | undefined {
  const host = windowId.slice('aw-watcher-window_'.length);
  const afk = buckets.filter((b) => isAfkBucket(b.id));
  return afk.find((b) => b.id === `aw-watcher-afk_${host}`) ?? afk[0];
}
