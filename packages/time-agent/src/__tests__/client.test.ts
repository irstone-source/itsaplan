import { describe, expect, it } from 'bun:test';
import { AuthError, CHUNK_SIZE, PlanClient, RequestError, type Fetch } from '../client';
import type { Block } from '../transform';

function block(i: number): Block {
  return {
    sourceKey: `k${i}`,
    source: 'activity',
    startedAt: '2026-11-02T09:00:00.000Z',
    endedAt: '2026-11-02T09:10:00.000Z',
    app: 'Code',
    title: String(i),
    domain: null,
  };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(responses: Array<{ status: number; body?: unknown }>): {
  fetch: Fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetch: Fetch = async (input, init) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const next = responses.shift() ?? {
      status: 200,
      body: { inserted: 0, updated: 0, skipped: 0 },
    };
    if (next.status === 0) throw new Error('connection refused');
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  };
  return { fetch, calls };
}

const ok = { status: 200, body: { inserted: 1, updated: 0, skipped: 0 } };

describe('upload', () => {
  it('sends the key header and the payload shape, in chunks of 2000', async () => {
    const { fetch, calls } = fakeFetch([ok, ok]);
    const client = new PlanClient('https://plan.test', 'secret', { fetch, backoffMs: 1 });
    const blocks = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => block(i));
    const result = await client.uploadBlocks('mac', blocks);
    expect(result).toEqual({ inserted: 2, updated: 0, skipped: 0 });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://plan.test/time/agent/blocks');
    expect(calls[0].headers['x-api-key']).toBe('secret');
    expect((calls[0].body as { blocks: Block[] }).blocks).toHaveLength(CHUNK_SIZE);
    expect((calls[1].body as { blocks: Block[] }).blocks).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ device: 'mac' });
  });

  it('retries a 5xx and a dead connection, then succeeds', async () => {
    const { fetch, calls } = fakeFetch([{ status: 503 }, { status: 0 }, ok]);
    const client = new PlanClient('https://plan.test', 'secret', { fetch, backoffMs: 1 });
    await client.uploadBlocks('mac', [block(1)]);
    expect(calls).toHaveLength(3);
  });

  it('stops on 401 without retrying', async () => {
    const { fetch, calls } = fakeFetch([{ status: 401 }]);
    const client = new PlanClient('https://plan.test', 'secret', { fetch, backoffMs: 1 });
    await expect(client.uploadBlocks('mac', [block(1)])).rejects.toBeInstanceOf(AuthError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry a 4xx other than 401', async () => {
    const { fetch, calls } = fakeFetch([{ status: 422, body: { error: 'bad' } }]);
    const client = new PlanClient('https://plan.test', 'secret', { fetch, backoffMs: 1 });
    await expect(
      client.heartbeat({ device: 'mac', platform: 'darwin', version: '0', awOk: true }),
    ).rejects.toBeInstanceOf(RequestError);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://plan.test/time/agent/heartbeat');
    expect(calls[0].body).toEqual({ device: 'mac', platform: 'darwin', version: '0', awOk: true });
  });
});
