import type { Pool, PoolClient } from 'pg';

/**
 * A query function can run against the pool directly or against a client
 * already inside a transaction -- callers decide which by what they pass in.
 * This is what lets services own their transaction boundaries
 * (CLAUDE.md > Project Structure: "services/ ... transaction boundaries live
 * here, not in routes") while query modules stay agnostic about it.
 */
export type Queryable = Pool | PoolClient;

export type UserRole = 'member' | 'admin';
export type UserStatus = 'pending_verification' | 'active' | 'deactivated';

export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The fields safe to ever send to a client. Never includes passwordHash. */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly emailVerifiedAt: string | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
  };
}

export type EmailTokenPurpose = 'verify_email' | 'reset_password';

export interface EmailTokenRow {
  readonly id: string;
  readonly userId: string;
  readonly purpose: EmailTokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}
