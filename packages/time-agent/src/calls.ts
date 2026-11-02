import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { queryRows, type Row } from './sqlite';
import { blockOf, type Block, type Piece } from './transform';

// iPhone calls synced to the Mac. ZDATE counts seconds from 2001-01-01 UTC.

const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

export const CALL_HISTORY_PATH = join(
  homedir(),
  'Library/Application Support/CallHistoryDB/CallHistory.storedata',
);
export const ADDRESS_BOOK_DIR = join(homedir(), 'Library/Application Support/AddressBook');

export const FULL_DISK_ACCESS_HINT =
  'Call history is not readable: give your terminal (or node) Full Disk Access in ' +
  'System Settings → Privacy & Security → Full Disk Access.';

export interface CallRow {
  ZDATE: number;
  ZDURATION: number;
  ZADDRESS: string | null;
  ZORIGINATED: number;
  ZANSWERED: number;
}

export type Contacts = Map<string, string>;

export function appleSecondsToMs(seconds: number): number {
  return APPLE_EPOCH_MS + seconds * 1000;
}

export function msToAppleSeconds(ms: number): number {
  return (ms - APPLE_EPOCH_MS) / 1000;
}

// Digits only, last ten: the same number with and without a country code matches.
export function normaliseNumber(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

export function contactName(row: { first: unknown; last: unknown; org: unknown }): string | null {
  const person = [row.first, row.last]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join(' ')
    .trim();
  if (person) return person;
  return typeof row.org === 'string' && row.org.trim() ? row.org.trim() : null;
}

export function contactsFromRows(rows: Row[]): Contacts {
  const contacts: Contacts = new Map();
  for (const row of rows) {
    const number = typeof row.number === 'string' ? normaliseNumber(row.number) : '';
    const name = contactName({ first: row.first, last: row.last, org: row.org });
    if (number && name && !contacts.has(number)) contacts.set(number, name);
  }
  return contacts;
}

export function callPiece(
  row: CallRow,
  contacts: Contacts,
): (Piece & { detail: Record<string, unknown> }) | null {
  if (!row.ZANSWERED || !(row.ZDURATION > 0)) return null;
  const number = row.ZADDRESS?.trim() || 'unknown';
  const contact = contacts.get(normaliseNumber(number)) ?? null;
  const start = appleSecondsToMs(row.ZDATE);
  return {
    start,
    end: start + Math.round(row.ZDURATION * 1000),
    app: 'Phone',
    title: `Call with ${contact ?? number}`,
    domain: null,
    detail: { direction: row.ZORIGINATED ? 'out' : 'in', contact, number },
  };
}

export function callBlocks(device: string, rows: CallRow[], contacts: Contacts): Block[] {
  const blocks: Block[] = [];
  for (const row of rows) {
    const piece = callPiece(row, contacts);
    if (piece) blocks.push(blockOf(device, piece, 'call', piece.detail));
  }
  return blocks;
}

export const CALLS_SQL = (sinceAppleSeconds: number) =>
  'SELECT ZDATE, ZDURATION, ZADDRESS, ZORIGINATED, ZANSWERED FROM ZCALLRECORD ' +
  `WHERE ZDATE > ${Number(sinceAppleSeconds)} ORDER BY ZDATE`;

export const CONTACTS_SQL =
  'SELECT p.ZFULLNUMBER AS number, r.ZFIRSTNAME AS first, r.ZLASTNAME AS last, ' +
  'r.ZORGANIZATION AS org FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON p.ZOWNER = r.Z_PK';

async function addressBooks(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const paths: string[] = [];
  const main = join(ADDRESS_BOOK_DIR, 'AddressBook-v22.abcddb');
  await access(main)
    .then(() => paths.push(main))
    .catch(() => {});
  const sources = join(ADDRESS_BOOK_DIR, 'Sources');
  const entries = await readdir(sources).catch(() => [] as string[]);
  for (const entry of entries) {
    const path = join(sources, entry, 'AddressBook-v22.abcddb');
    await access(path)
      .then(() => paths.push(path))
      .catch(() => {});
  }
  return paths;
}

export async function readContacts(): Promise<Contacts> {
  const contacts: Contacts = new Map();
  for (const path of await addressBooks()) {
    const rows = await queryRows(path, CONTACTS_SQL).catch(() => [] as Row[]);
    for (const [number, name] of contactsFromRows(rows)) {
      if (!contacts.has(number)) contacts.set(number, name);
    }
  }
  return contacts;
}

export async function readCalls(sinceMs: number, dbPath = CALL_HISTORY_PATH): Promise<CallRow[]> {
  try {
    const rows = await queryRows(dbPath, CALLS_SQL(msToAppleSeconds(sinceMs)));
    return rows.map((row) => ({
      ZDATE: Number(row.ZDATE),
      ZDURATION: Number(row.ZDURATION ?? 0),
      ZADDRESS: typeof row.ZADDRESS === 'string' ? row.ZADDRESS : null,
      ZORIGINATED: Number(row.ZORIGINATED ?? 0),
      ZANSWERED: Number(row.ZANSWERED ?? 0),
    }));
  } catch (err) {
    throw new Error(`${FULL_DISK_ACCESS_HINT} (${(err as Error).message.split('\n')[0]})`);
  }
}
