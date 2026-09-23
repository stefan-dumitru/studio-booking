import type { Queryable, UserRole, UserRow, UserStatus } from '../types.js';

interface RawUserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  email_verified_at: Date | null;
  deactivated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RawUserRow): UserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertPendingUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
}

/** Always inserts as pending_verification/member -- the only way in is registration. */
export async function insertPendingUser(
  db: Queryable,
  input: InsertPendingUserInput,
): Promise<UserRow> {
  const result = await db.query<RawUserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.email, input.passwordHash, input.displayName],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insertPendingUser: INSERT ... RETURNING produced no row');
  return mapRow(row);
}

/** citext makes this case-insensitive at the database level. */
export async function findUserByEmail(
  db: Queryable,
  email: string,
): Promise<UserRow | null> {
  const result = await db.query<RawUserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function findUserById(
  db: Queryable,
  id: string,
): Promise<UserRow | null> {
  const result = await db.query<RawUserRow>('SELECT * FROM users WHERE id = $1', [
    id,
  ]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markEmailVerified(
  db: Queryable,
  userId: string,
): Promise<UserRow> {
  const result = await db.query<RawUserRow>(
    `UPDATE users SET status = 'active', email_verified_at = now()
     WHERE id = $1
     RETURNING *`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`markEmailVerified: no user with id ${userId}`);
  return mapRow(row);
}

export async function updatePasswordHash(
  db: Queryable,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
    userId,
    passwordHash,
  ]);
}
