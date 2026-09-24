import type { Pool } from 'pg';

/**
 * Direct SQL for states the API can't reach on its own (an expired token, a
 * deactivated account, an admin) -- these exist purely to set up test
 * fixtures, never to assert on.
 */

export async function expireAllTokensForEmail(
  pool: Pool,
  email: string,
): Promise<void> {
  await pool.query(
    `UPDATE email_tokens SET expires_at = now() - interval '1 minute'
      WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [email],
  );
}

export async function deactivateUserByEmail(
  pool: Pool,
  email: string,
): Promise<void> {
  await pool.query(
    "UPDATE users SET status = 'deactivated', deactivated_at = now() WHERE email = $1",
    [email],
  );
}

export async function promoteToAdminByEmail(
  pool: Pool,
  email: string,
): Promise<void> {
  await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
}

export async function userExistsByEmail(
  pool: Pool,
  email: string,
): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  return (result.rowCount ?? 0) > 0;
}

export async function sessionCountForUserId(
  pool: Pool,
  userId: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT count(*)::int AS count FROM session WHERE (sess::jsonb ->> 'userId') = $1`,
    [userId],
  );
  return (result.rows[0] as { count: number } | undefined)?.count ?? 0;
}

export interface BookingFixtureInput {
  readonly resourceId: string;
  readonly memberId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/**
 * Inserts a booking directly, bypassing the (not-yet-built, Phase 3) booking
 * API -- this is how the archive-block and stranded-bookings tests reach a
 * state the current API can't produce on its own, same pattern as
 * bookingSlots.test.ts uses for the schema-level tests.
 */
export async function insertBookingFixture(
  pool: Pool,
  input: BookingFixtureInput,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO bookings (resource_id, member_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.resourceId, input.memberId, input.startsAt, input.endsAt],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('insertBookingFixture: INSERT ... RETURNING produced no row');
  }
  return id;
}

/** Extracts the token= query-string value from a mailed link (the dev mailer
 * logs it, tests read it from the captured MailMessage.text instead). */
export function extractTokenFromLink(text: string): string {
  const match = /[?&]token=([a-f0-9]+)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No token found in mail body:\n${text}`);
  }
  return match[1];
}
