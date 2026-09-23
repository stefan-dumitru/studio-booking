import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The test database URL, with a message that says what to do rather than just
 * failing on a null connection string.
 */
export function testDatabaseUrl(): string {
  const url = process.env['TEST_DATABASE_URL']?.trim();
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env, fill it in, ' +
        'then run `npm run db:create`.',
    );
  }
  return url;
}

/**
 * Drives the real node-pg-migrate CLI rather than its programmatic API, so the
 * tests exercise the same code path as `npm run migrate:up`. A migration that
 * only works when called from a test is not a migration that works.
 */
export async function migrateTestDatabase(
  direction: 'up' | 'down',
  count = 999,
): Promise<void> {
  const args = [
    'node_modules/node-pg-migrate/bin/node-pg-migrate.js',
    direction,
    ...(direction === 'down' ? [String(count)] : []),
    '-m',
    'server/migrations',
    '-j',
    'sql',
    '-d',
    'TEST_DATABASE_URL',
  ];

  try {
    await execFileAsync(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
    });
  } catch (error) {
    const details =
      error instanceof Error && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr)
        : String(error);
    throw new Error(`Migration ${direction} failed:\n${details}`, {
      cause: error,
    });
  }
}

export function createTestPool(): Pool {
  return new Pool({
    connectionString: testDatabaseUrl(),
    connectionTimeoutMillis: 5_000,
    max: 4,
  });
}

/** Lists the application tables currently present, ignoring the migrations table. */
export async function listTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> 'pgmigrations'
      ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/** Empties every application table, resetting identities, between tests. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE booking_slots, bookings, email_tokens, audit_log, resources, resource_types, users, session RESTART IDENTITY CASCADE',
  );
}
