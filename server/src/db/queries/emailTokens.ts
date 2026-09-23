import type { EmailTokenPurpose, EmailTokenRow, Queryable } from '../types.js';

interface RawTokenRow {
  id: string;
  user_id: string;
  purpose: EmailTokenPurpose;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

function mapRow(row: RawTokenRow): EmailTokenRow {
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export interface InsertTokenInput {
  readonly userId: string;
  readonly purpose: EmailTokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export async function insertEmailToken(
  db: Queryable,
  input: InsertTokenInput,
): Promise<EmailTokenRow> {
  const result = await db.query<RawTokenRow>(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.userId, input.purpose, input.tokenHash, input.expiresAt],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insertEmailToken: INSERT ... RETURNING produced no row');
  return mapRow(row);
}

/**
 * Returns the token row regardless of whether it is expired or already used --
 * the caller (the auth service) decides which of "not found" / "already used"
 * / "expired" to report, since those are three different user-facing messages
 * (specifications/operations.md > Concurrency & Write Correctness).
 */
export async function findTokenByHash(
  db: Queryable,
  purpose: EmailTokenPurpose,
  tokenHash: string,
): Promise<EmailTokenRow | null> {
  const result = await db.query<RawTokenRow>(
    'SELECT * FROM email_tokens WHERE purpose = $1 AND token_hash = $2',
    [purpose, tokenHash],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markTokenUsed(db: Queryable, tokenId: string): Promise<void> {
  await db.query('UPDATE email_tokens SET used_at = now() WHERE id = $1', [
    tokenId,
  ]);
}

/**
 * Invalidates every outstanding (unused) token of one purpose for a user --
 * used when issuing a fresh verification or reset link, so only the newest
 * one works.
 */
export async function invalidateTokensByPurpose(
  db: Queryable,
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<void> {
  await db.query(
    `UPDATE email_tokens SET used_at = now()
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose],
  );
}

/**
 * Invalidates every outstanding token of every purpose for a user -- the
 * password-reset completion case, which security.md specifies as "every
 * outstanding token", not just the one that was used.
 */
export async function invalidateAllTokensForUser(
  db: Queryable,
  userId: string,
): Promise<void> {
  await db.query(
    'UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );
}
