import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appleSecondsToMs,
  callBlocks,
  callPiece,
  contactName,
  contactsFromRows,
  normaliseNumber,
  readCalls,
  type CallRow,
  type Contacts,
} from '../calls';
import { queryRows } from '../sqlite';
import { sourceKeyOf } from '../transform';

// 2026-11-02T09:00:00Z in seconds since 2001-01-01.
const Z = (Date.parse('2026-11-02T09:00:00Z') - Date.UTC(2001, 0, 1)) / 1000;

function row(over: Partial<CallRow> = {}): CallRow {
  return {
    ZDATE: Z,
    ZDURATION: 300,
    ZADDRESS: '+447700900123',
    ZORIGINATED: 1,
    ZANSWERED: 1,
    ...over,
  };
}

const contacts: Contacts = new Map([['7700900123', 'Kate Barrett']]);

describe('row → block', () => {
  it('maps an answered outgoing call to a Phone block with the contact name', () => {
    const [block] = callBlocks('mac', [row()], contacts);
    expect(block).toMatchObject({
      source: 'call',
      app: 'Phone',
      title: 'Call with Kate Barrett',
      domain: null,
      startedAt: '2026-11-02T09:00:00.000Z',
      endedAt: '2026-11-02T09:05:00.000Z',
      detail: { direction: 'out', contact: 'Kate Barrett', number: '+447700900123' },
    });
    expect(block.sourceKey).toBe(
      sourceKeyOf('mac', 'Phone', 'Call with Kate Barrett', appleSecondsToMs(Z)),
    );
  });

  it('falls back to the number and reads direction from ZORIGINATED', () => {
    const piece = callPiece(row({ ZADDRESS: '01242 123456', ZORIGINATED: 0 }), contacts);
    expect(piece?.title).toBe('Call with 01242 123456');
    expect(piece?.detail).toEqual({ direction: 'in', contact: null, number: '01242 123456' });
  });

  it('skips unanswered and zero-duration calls', () => {
    expect(callPiece(row({ ZANSWERED: 0 }), contacts)).toBeNull();
    expect(callPiece(row({ ZDURATION: 0 }), contacts)).toBeNull();
  });
});

describe('contacts', () => {
  it('normalises numbers to their last ten digits', () => {
    expect(normaliseNumber('+44 7700 900123')).toBe('7700900123');
    expect(normaliseNumber('07700900123')).toBe('7700900123');
  });

  it('prefers a person name and falls back to the organisation', () => {
    expect(contactName({ first: 'Kate', last: 'Barrett', org: 'Lanoguard' })).toBe('Kate Barrett');
    expect(contactName({ first: null, last: null, org: 'Lanoguard' })).toBe('Lanoguard');
    expect(contactName({ first: '', last: null, org: null })).toBeNull();
  });

  it('builds the lookup from address book rows', () => {
    const map = contactsFromRows([
      { number: '+44 7700 900123', first: 'Kate', last: 'Barrett', org: null },
      { number: '07700900999', first: null, last: null, org: 'OSRL' },
      { number: '', first: 'Nobody', last: null, org: null },
    ]);
    expect(map.get('7700900123')).toBe('Kate Barrett');
    expect(map.get('7700900999')).toBe('OSRL');
    expect(map.size).toBe(2);
  });
});

function sqlite3Present(): boolean {
  try {
    execFileSync('sqlite3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('call history database', () => {
  it.skipIf(!sqlite3Present())('reads rows after the cursor from a fixture database', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'plan-time-calls-'));
    const db = join(dir, 'CallHistory.storedata');
    execFileSync('sqlite3', [
      db,
      'CREATE TABLE ZCALLRECORD (Z_PK INTEGER PRIMARY KEY, ZDATE REAL, ZDURATION REAL, ZADDRESS TEXT, ZORIGINATED INTEGER, ZANSWERED INTEGER);' +
        `INSERT INTO ZCALLRECORD VALUES (1, ${Z - 86400}, 60, '+447700900001', 0, 1);` +
        `INSERT INTO ZCALLRECORD VALUES (2, ${Z}, 300.5, '+447700900123', 1, 1);` +
        `INSERT INTO ZCALLRECORD VALUES (3, ${Z + 60}, 0, '+447700900123', 0, 0);`,
    ]);
    const rows = await readCalls(appleSecondsToMs(Z - 1), db);
    expect(rows).toEqual([
      row({ ZDURATION: 300.5 }),
      row({ ZDATE: Z + 60, ZDURATION: 0, ZORIGINATED: 0, ZANSWERED: 0 }),
    ]);
    expect(callBlocks('mac', rows, contacts)).toHaveLength(1);
    expect(await queryRows(db, 'SELECT COUNT(*) AS n FROM ZCALLRECORD')).toEqual([{ n: 3 }]);
  });

  it('explains Full Disk Access when the database cannot be opened', async () => {
    await expect(readCalls(0, '/nonexistent/CallHistory.storedata')).rejects.toThrow(
      /Full Disk Access/,
    );
  });
});
