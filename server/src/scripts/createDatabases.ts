/**
 * Creates the application and test databases if they do not already exist.
 *
 * Run once after filling in .env:  npm run db:create
 *
 * Idempotent -- running it again reports what already exists and changes
 * nothing.
 */
import { Client, escapeIdentifier } from 'pg';

interface Target {
  readonly label: string;
  readonly url: string;
}

function collectTargets(env: NodeJS.ProcessEnv): Target[] {
  const targets: Target[] = [];
  const appUrl = env['DATABASE_URL']?.trim();
  const testUrl = env['TEST_DATABASE_URL']?.trim();

  if (!appUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
    );
  }
  targets.push({ label: 'application', url: appUrl });
  if (testUrl) targets.push({ label: 'test', url: testUrl });

  return targets;
}

/**
 * Splits a connection string into the database name and a URL pointing at the
 * server's default maintenance database, which is where CREATE DATABASE has to
 * be issued from.
 */
function splitConnectionString(url: string): {
  databaseName: string;
  maintenanceUrl: string;
} {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error(`Connection string has no database name: ${parsed.pathname}`);
  }
  parsed.pathname = '/postgres';
  return { databaseName, maintenanceUrl: parsed.toString() };
}

async function ensureDatabase(target: Target): Promise<void> {
  const { databaseName, maintenanceUrl } = splitConnectionString(target.url);
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  ${target.label}: "${databaseName}" already exists`);
      return;
    }

    // CREATE DATABASE cannot take bind parameters -- it is not a plannable
    // statement -- so the identifier is escaped instead. This is the one
    // deliberate exception to "parameterized queries only" (CLAUDE.md), and it
    // is safe because escapeIdentifier is pg's own quoting routine.
    await client.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
    console.log(`  ${target.label}: created "${databaseName}"`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const targets = collectTargets(process.env);
  console.log('Ensuring databases exist:');
  for (const target of targets) {
    await ensureDatabase(target);
  }
  console.log('Done. Next: npm run migrate:up');
}

main().catch((error: unknown) => {
  console.error(
    `\nFailed to create databases: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
