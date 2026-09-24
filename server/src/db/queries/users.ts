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

/**
 * Locks the member's own row for the duration of the caller's transaction --
 * serialises a single member's concurrent booking attempts against their own
 * 3-active-bookings cap without affecting anyone else's
 * (operations.md > Concurrency & Write Correctness, race #4).
 */
export async function lockUserForBookingCheck(
  db: Queryable,
  userId: string,
): Promise<UserRow | null> {
  const result = await db.query<RawUserRow>(
    'SELECT * FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Locks every currently-active admin row for the duration of the caller's
 * transaction -- the check both deactivation and role-change demotion run
 * before deciding whether they'd drop the count to zero
 * (data-model.md > users: "at least one active admin must exist at all
 * times"; operations.md > Concurrency, race #5). Two concurrent requests
 * against this same set serialise: the second sees whatever the first just
 * committed, not a stale count.
 */
export async function lockActiveAdmins(db: Queryable): Promise<readonly string[]> {
  // ORDER BY id gives every transaction the same lock-acquisition order --
  // without it, two concurrent callers could each grab a different row
  // first and deadlock waiting on each other's, instead of one cleanly
  // blocking behind the other (the same reasoning `data-model.md` and
  // `operations.md`'s race #5 assume implicitly).
  const result = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id FOR UPDATE`,
  );
  return result.rows.map((row) => row.id);
}

export async function setUserStatus(
  db: Queryable,
  id: string,
  status: UserStatus,
): Promise<UserRow> {
  const result = await db.query<RawUserRow>(
    `UPDATE users SET status = $2, deactivated_at = CASE WHEN $2 = 'deactivated' THEN now() ELSE NULL END
      WHERE id = $1
      RETURNING *`,
    [id, status],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`setUserStatus: no user with id ${id}`);
  return mapRow(row);
}

export async function setUserRole(
  db: Queryable,
  id: string,
  role: UserRole,
): Promise<UserRow> {
  const result = await db.query<RawUserRow>(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING *`,
    [id, role],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`setUserRole: no user with id ${id}`);
  return mapRow(row);
}

export async function countPendingVerificationMembers(db: Queryable): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM users WHERE status = 'pending_verification'`,
  );
  return Number(result.rows[0]?.count ?? '0');
}

export type AdminMemberStatusFilter = 'active' | 'pending_verification' | 'deactivated' | 'all';

export interface ListUsersForAdminOptions {
  readonly q: string;
  readonly status: AdminMemberStatusFilter;
  readonly limit: number;
  readonly offset: number;
}

export interface ListUsersForAdminResult {
  readonly rows: readonly UserRow[];
  readonly total: number;
}

/** The admin member list -- functional.md > Search & Reporting: "free-text
 * on display_name and email, plus a filter on account status." Same
 * dynamic-WHERE-builder pattern as resources.ts's listResources. */
export async function listUsersForAdmin(
  db: Queryable,
  options: ListUsersForAdminOptions,
): Promise<ListUsersForAdminResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.q.trim()) {
    params.push(`%${options.q.trim()}%`);
    conditions.push(`(display_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (options.status !== 'all') {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(options.limit);
  const limitParam = `$${params.length}`;
  params.push(options.offset);
  const offsetParam = `$${params.length}`;

  const [rowsResult, countResult] = await Promise.all([
    db.query<RawUserRow>(
      `SELECT * FROM users ${whereClause}
        ORDER BY display_name ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    ),
    db.query<{ count: string }>(
      `SELECT count(*) AS count FROM users ${whereClause}`,
      params.slice(0, params.length - 2),
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapRow),
    total: Number(countResult.rows[0]?.count ?? '0'),
  };
}
