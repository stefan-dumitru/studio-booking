/**
 * Creates the first admin account.
 *
 * There is no admin to create it through the UI, and promoting the first
 * registered user automatically would be a hazard if the app were ever
 * reachable before you registered -- so it is an explicit, repeatable script
 * reading credentials from the environment.
 *
 * Run:  npm run seed:admin
 *
 * Idempotent: if the email already exists it reports and changes nothing, so a
 * second run is safe and does not reset anyone's password.
 */
import bcrypt from 'bcrypt';
import { checkPassword } from '@studio/shared';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';

interface SeedInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

function readSeedInput(env: NodeJS.ProcessEnv): SeedInput {
  const email = env['SEED_ADMIN_EMAIL']?.trim();
  const password = env['SEED_ADMIN_PASSWORD'];
  const displayName = env['SEED_ADMIN_NAME']?.trim();

  const missing = [
    !email && 'SEED_ADMIN_EMAIL',
    !password && 'SEED_ADMIN_PASSWORD',
    !displayName && 'SEED_ADMIN_NAME',
  ].filter((key): key is string => typeof key === 'string');

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')} in .env -- fill them in and run again.`,
    );
  }

  // Non-null assertions are safe: the check above covers every one.
  const check = checkPassword(password!);
  if (!check.valid) {
    throw new Error(
      `SEED_ADMIN_PASSWORD is too weak. It ${check.problems.join(', and ')}.`,
    );
  }

  return { email: email!, password: password!, displayName: displayName! };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const input = readSeedInput(process.env);
  const pool = createPool({ connectionString: config.databaseUrl });

  try {
    const existing = await pool.query<{ id: string; role: string }>(
      'SELECT id, role FROM users WHERE email = $1',
      [input.email],
    );

    const found = existing.rows[0];
    if (found) {
      console.log(
        `Nothing to do: ${input.email} already exists (id ${found.id}, role ${found.role}).`,
      );
      console.log('This script never overwrites an existing account.');
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, config.bcryptCost);

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name, role, status, email_verified_at)
       VALUES ($1, $2, $3, 'admin', 'active', now())
       RETURNING id`,
      [input.email, passwordHash, input.displayName],
    );

    console.log(
      `Created admin ${input.email} (id ${inserted.rows[0]?.id}), already verified and active.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nSeed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
