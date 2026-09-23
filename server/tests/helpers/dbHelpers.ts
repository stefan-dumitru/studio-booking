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

/** Extracts the token= query-string value from a mailed link (the dev mailer
 * logs it, tests read it from the captured MailMessage.text instead). */
export function extractTokenFromLink(text: string): string {
  const match = /[?&]token=([a-f0-9]+)/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No token found in mail body:\n${text}`);
  }
  return match[1];
}
