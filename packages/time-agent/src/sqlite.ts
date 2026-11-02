import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Read-only SQL against a database file. Uses node:sqlite where Node ships it and the
// sqlite3 CLI otherwise, so the bundle needs no native module.

const run = promisify(execFile);

export type Row = Record<string, unknown>;

interface NodeSqlite {
  DatabaseSync: new (
    path: string,
    options: { readOnly: boolean },
  ) => { prepare(sql: string): { all(): Row[] }; close(): void };
}

async function nodeSqlite(): Promise<NodeSqlite | null> {
  try {
    const mod = (await import('node:sqlite')) as unknown as NodeSqlite;
    return typeof mod.DatabaseSync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

export async function queryRows(path: string, sql: string): Promise<Row[]> {
  const lib = await nodeSqlite();
  if (lib) {
    const db = new lib.DatabaseSync(path, { readOnly: true });
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }
  const { stdout } = await run('sqlite3', ['-readonly', '-json', path, sql], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim() ? (JSON.parse(stdout) as Row[]) : [];
}
