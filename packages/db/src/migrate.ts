// Programmatic migration runner — used on api container startup
// (drizzle-kit is not needed in production, only the generated SQL in ./drizzle).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
  pendingMigrations,
  pruneBackups,
  recordBackup,
  recordMigrationRun,
  writeBackup,
} from './backup';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — cannot run migrations.');
}

// max_lifetime off: postgres.js otherwise closes the connection after 30–60 minutes,
// which would release the migration lock below while a long pg_dump is still running.
const migrationClient = postgres(connectionString, { max: 1, max_lifetime: null });
const db = drizzle(migrationClient);

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

// A build's own tables, kept apart from the core's: its migrations folder, applied after
// the core's under the same lock and backup, with a bookkeeping table of its own.
const buildFolder = process.env.BUILD_MIGRATIONS_DIR;
const BUILD_TABLE = '__build_migrations';
const readJournal = (folder: string) =>
  JSON.parse(readFileSync(`${folder}/meta/_journal.json`, 'utf8'));

// Compose orders the api behind a healthy postgres, but a platform without that
// guarantee (Railway, plain `docker run`) starts both at once and the first
// connections are refused. Wait for the server separately so a failing migration
// still reports on the first attempt.
const ATTEMPTS = 15;
const RETRY_DELAY_MS = 2000;

for (let attempt = 1; ; attempt++) {
  try {
    await migrationClient`select 1`;
    break;
  } catch (error) {
    if (attempt === ATTEMPTS) throw error;
    console.log(`⏳ Waiting for the database (${attempt}/${ATTEMPTS})...`);
    await Bun.sleep(RETRY_DELAY_MS);
  }
}

// Several api replicas start together on every rollout. The lock lets one of them dump
// and migrate while the rest wait, and the rest then find nothing pending. It belongs
// to this session, so Postgres releases it when the connection closes, a crash included.
const MIGRATION_LOCK_KEY = 804_216_551;
const [{ locked }] = await migrationClient<{ locked: boolean }[]>`
  select pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) as locked
`;
if (!locked) {
  console.log('⏳ Another instance is migrating the database, waiting for it to finish...');
  await migrationClient`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
}

// A dump of the database as this release found it, so an operator who has to go back
// to the previous release has something to restore. Taken before anything is applied,
// and a failure stops the startup: a migration that runs without one cannot be undone.
// SKIP_PRE_MIGRATION_BACKUP=1 is for an operator who backs up by other means, and is
// what `db:migrate:test` sets — BACKUP_DIR is a path only the api container has, and
// a test database that is truncated between tests has nothing to go back to.
const journal = readJournal(migrationsFolder);

// drizzle applies only the migrations newer than the newest one it has recorded. A
// recorded migration whose timestamp is in no journal entry was renumbered away (Cambray's
// migrations, folded into one re-runnable migration each time upstream took their
// numbers), and left in place it would hide every upstream migration older than it. Such
// records are left out of the pending count here and deleted once the backup is written:
// the dump then still holds the ledger the previous release expects, so restoring it
// does not make that release re-run migrations of its own that are not re-runnable.
const entries: { when: number; tag: string }[] = journal.entries;
const known = new Set<number>(entries.map((e) => e.when));
const [{ exists: hasLedger }] = await migrationClient<{ exists: boolean }[]>`
  select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
const recorded = hasLedger
  ? await migrationClient<{ id: number; created_at: string }[]>`
    select id, created_at from drizzle.__drizzle_migrations`
  : [];
const orphans = recorded.filter((r) => !known.has(Number(r.created_at)));
// The core migrations drizzle will apply once the orphans are gone: the journal entries
// newer than the newest record still in it. An empty ledger is a new database, which
// has nothing to dump (the rule pendingMigrations applies).
const lastKept = Math.max(
  0,
  ...recorded.filter((r) => known.has(Number(r.created_at))).map((r) => Number(r.created_at)),
);
const corePending =
  recorded.length === 0
    ? []
    : entries
        .filter((e) => e.when > lastKept)
        .sort((a, b) => a.when - b.when)
        .map((e) => e.tag);
const pending = [
  ...corePending,
  ...(buildFolder
    ? await pendingMigrations(migrationClient, readJournal(buildFolder), BUILD_TABLE)
    : []),
];
const skipBackup = process.env.SKIP_PRE_MIGRATION_BACKUP === '1';
let backup = null;

if (pending.length > 0 && !skipBackup) {
  console.log(`⏳ Backing up the database before ${pending.length} migration(s)...`);
  try {
    backup = await writeBackup(pending);
  } catch (error) {
    console.error(
      `❌ The backup failed, so no migration was applied: ${error instanceof Error ? error.message : String(error)}\n` +
        '   Fix the backup, or set SKIP_PRE_MIGRATION_BACKUP=1 to upgrade without one.',
    );
    throw error;
  }
  console.log(`✅ Backup written to ${backup.path} (${Math.round(backup.sizeBytes / 1024)} KB)`);
}

if (orphans.length > 0) {
  await migrationClient`delete from drizzle.__drizzle_migrations where id in ${migrationClient(orphans.map((r) => r.id))}`;
  console.log(`🧭 Dropped ${orphans.length} record(s) of migrations no longer in the journal`);
}

console.log('⏳ Running migrations...');
await migrate(db, { migrationsFolder });
if (buildFolder) await migrate(db, { migrationsFolder: buildFolder, migrationsTable: BUILD_TABLE });
if (pending.length > 0) await recordMigrationRun(migrationClient, pending);
if (backup) await recordBackup(migrationClient, backup);
const removed = await pruneBackups();
if (removed > 0) console.log(`🧹 Removed ${removed} backup(s) past the retention window`);
await migrationClient.end();
console.log('✅ Migrations applied');
