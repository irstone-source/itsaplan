import { describe, expect, it } from 'bun:test';
import {
  applyPrivate,
  attachDomains,
  buildBlocks,
  clipToIntervals,
  domainOf,
  dropShort,
  isBrowser,
  isPrivate,
  mergePieces,
  notAfkIntervals,
  piecesOf,
  sourceKeyOf,
  splitLong,
  startMinuteIso,
  type AwEvent,
  type Piece,
  type PrivateList,
} from '../transform';

const T0 = Date.parse('2026-11-02T09:00:00.000Z');
const MIN = 60_000;

function at(minutes: number): string {
  return new Date(T0 + minutes * MIN).toISOString();
}

function win(startMin: number, durationMin: number, app: string, title = ''): AwEvent {
  return { timestamp: at(startMin), duration: durationMin * 60, data: { app, title } };
}

function afk(startMin: number, durationMin: number, status: 'afk' | 'not-afk'): AwEvent {
  return { timestamp: at(startMin), duration: durationMin * 60, data: { status } };
}

function web(startMin: number, durationMin: number, url: string): AwEvent {
  return { timestamp: at(startMin), duration: durationMin * 60, data: { url, title: 'tab' } };
}

function piece(
  startMin: number,
  endMin: number,
  app: string,
  title = '',
  domain: string | null = null,
): Piece {
  return { start: T0 + startMin * MIN, end: T0 + endMin * MIN, app, title, domain };
}

const NONE: PrivateList = { apps: [], domains: [], titles: [] };

describe('afk clipping', () => {
  it('keeps only the not-afk parts and splits a piece across an afk gap', () => {
    const pieces = piecesOf([win(0, 60, 'Code', 'main.ts')]);
    const intervals = notAfkIntervals([
      afk(0, 20, 'not-afk'),
      afk(20, 10, 'afk'),
      afk(30, 30, 'not-afk'),
    ]);
    expect(clipToIntervals(pieces, intervals)).toEqual([
      piece(0, 20, 'Code', 'main.ts'),
      piece(30, 60, 'Code', 'main.ts'),
    ]);
  });

  it('drops a piece entirely outside not-afk time', () => {
    const pieces = piecesOf([win(40, 10, 'Code')]);
    expect(clipToIntervals(pieces, notAfkIntervals([afk(0, 30, 'not-afk')]))).toEqual([]);
  });

  it('joins adjacent not-afk events', () => {
    expect(notAfkIntervals([afk(0, 10, 'not-afk'), afk(10, 10, 'not-afk')])).toEqual([
      { start: T0, end: T0 + 20 * MIN },
    ]);
  });
});

describe('web domain', () => {
  it('attaches the hostname of the tab that overlaps a browser window the most', () => {
    const pieces = [piece(0, 30, 'Google Chrome', 'Ads')];
    const out = attachDomains(pieces, [
      web(0, 5, 'https://www.google.com/search?q=x'),
      web(5, 25, 'https://ads.google.com/aw/campaigns?id=123'),
    ]);
    expect(out[0].domain).toBe('ads.google.com');
  });

  it('never attaches to a non-browser app and never keeps the path', () => {
    const out = attachDomains([piece(0, 30, 'Code')], [web(0, 30, 'https://github.com/x/y')]);
    expect(out[0].domain).toBeNull();
    expect(domainOf('https://www.Example.com/private/path?token=1')).toBe('example.com');
    expect(domainOf('not a url')).toBeNull();
  });

  it('recognises browsers by word', () => {
    expect(isBrowser('Google Chrome')).toBe(true);
    expect(isBrowser('Safari')).toBe(true);
    expect(isBrowser('msedge.exe')).toBe(true);
    expect(isBrowser('Archive Utility')).toBe(false);
  });
});

describe('merging', () => {
  it('merges the same app and title separated by under 60 seconds', () => {
    const out = mergePieces([
      piece(0, 10, 'Code', 'a'),
      { ...piece(10, 20, 'Code', 'a'), start: T0 + 10 * MIN + 30_000 },
    ]);
    expect(out).toEqual([piece(0, 20, 'Code', 'a')]);
  });

  it('does not merge across a 60 second gap or a different title', () => {
    expect(mergePieces([piece(0, 10, 'Code', 'a'), piece(11, 20, 'Code', 'a')])).toHaveLength(2);
    expect(mergePieces([piece(0, 10, 'Code', 'a'), piece(10, 20, 'Code', 'b')])).toHaveLength(2);
  });
});

describe('length limits', () => {
  it('drops blocks under two minutes', () => {
    const out = dropShort([piece(0, 1, 'Code'), piece(1, 3, 'Code'), piece(3, 5, 'Code')]);
    expect(out).toHaveLength(2);
  });

  it('splits blocks over three hours', () => {
    const out = splitLong([piece(0, 7 * 60 + 30, 'Code')]);
    expect(out.map((p) => (p.end - p.start) / MIN)).toEqual([180, 180, 90]);
    expect(out[1].start).toBe(T0 + 180 * MIN);
  });
});

describe('private list', () => {
  const list: PrivateList = { apps: ['1Password'], domains: ['hsbc.co.uk'], titles: ['Incognito'] };

  it('matches app and title case-insensitively and domains by suffix', () => {
    expect(isPrivate({ app: '1password', title: '', domain: null }, list)).toBe(true);
    expect(isPrivate({ app: '1Password.exe', title: '', domain: null }, list)).toBe(true);
    expect(isPrivate({ app: 'Chrome', title: 'Tab — INCOGNITO', domain: null }, list)).toBe(true);
    expect(isPrivate({ app: 'Chrome', title: '', domain: 'online.hsbc.co.uk' }, list)).toBe(true);
    expect(isPrivate({ app: 'Chrome', title: '', domain: 'nothsbc.co.uk' }, list)).toBe(false);
    expect(isPrivate({ app: 'Code', title: 'main.ts', domain: 'github.com' }, list)).toBe(false);
  });

  it('removes private pieces before anything is keyed', () => {
    const out = applyPrivate([piece(0, 5, '1Password'), piece(5, 10, 'Code')], list);
    expect(out.map((p) => p.app)).toEqual(['Code']);
  });
});

describe('source key', () => {
  it('is stable for the same device, app, title and start minute', () => {
    const a = sourceKeyOf('mac', 'Code', 'x', T0 + 10_000);
    const b = sourceKeyOf('mac', 'Code', 'x', T0 + 50_000);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceKeyOf('mac', 'Code', 'x', T0 + 61_000)).not.toBe(a);
    expect(sourceKeyOf('pc', 'Code', 'x', T0)).not.toBe(a);
    expect(startMinuteIso(T0 + 59_999)).toBe('2026-11-02T09:00:00.000Z');
  });
});

describe('buildBlocks', () => {
  it('runs the whole transform on fixture events', () => {
    const blocks = buildBlocks({
      device: 'mac',
      windowEvents: [
        win(0, 10, 'Google Chrome', 'FGE account'),
        {
          ...win(10, 10, 'Google Chrome', 'FGE account'),
          timestamp: at(10).replace('00.000', '20.000'),
        },
        win(20, 1, 'Slack', 'DM'),
        win(21, 9, 'Safari', 'Online banking'),
        win(30, 30, 'Code', 'main.ts'),
      ],
      afkEvents: [afk(0, 45, 'not-afk'), afk(45, 15, 'afk')],
      webEvents: [
        web(0, 20, 'https://ads.google.com/aw'),
        web(21, 9, 'https://online.hsbc.co.uk/x'),
      ],
      privateList: { apps: [], domains: ['hsbc.co.uk'], titles: [] },
    });
    expect(blocks.map((b) => [b.app, b.domain, b.startedAt, b.endedAt])).toEqual([
      ['Google Chrome', 'ads.google.com', at(0), '2026-11-02T09:20:20.000Z'],
      ['Code', null, at(30), at(45)],
    ]);
    expect(blocks[0]).toMatchObject({ source: 'activity', title: 'FGE account' });
    expect(blocks[0].sourceKey).toBe(sourceKeyOf('mac', 'Google Chrome', 'FGE account', T0));
    expect(blocks[0]).not.toHaveProperty('detail');
  });

  it('clips nothing when there is no afk watcher', () => {
    const blocks = buildBlocks({
      device: 'mac',
      windowEvents: [win(0, 10, 'Code', 'a')],
      afkEvents: null,
      webEvents: [],
      privateList: NONE,
    });
    expect(blocks).toHaveLength(1);
  });
});
