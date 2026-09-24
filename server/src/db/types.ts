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

export interface ResourceTypeRow {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResourceTypeDto {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}

export function toResourceTypeDto(row: ResourceTypeRow): ResourceTypeDto {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export interface ResourceRow {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  /** Studio-local wall clock, "HH:MM:SS" as Postgres returns a TIME column. */
  readonly openTime: string;
  readonly closeTime: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResourceDto {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly archivedAt: string | null;
}

export function toResourceDto(row: ResourceRow): ResourceDto {
  return {
    id: row.id,
    name: row.name,
    typeId: row.typeId,
    description: row.description,
    capacity: row.capacity,
    // Trims Postgres's ":00" seconds so the client gets back exactly the
    // "HH:MM" shape its <input type="time"> sent.
    openTime: row.openTime.slice(0, 5),
    closeTime: row.closeTime.slice(0, 5),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

/** A booking conflicting with an archive or an hours edit -- what the admin
 * is shown so they can act on it (functional.md > Archive/Edit a resource). */
export interface ConflictingBookingDto {
  readonly bookingId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly memberDisplayName: string;
}

export type BookingStatus = 'booked' | 'cancelled';

export interface BookingRow {
  readonly id: string;
  readonly resourceId: string;
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: BookingStatus;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
  readonly createdAt: Date;
}

/** Never includes another member's identity -- there is none on this row to
 * begin with, since a booking's own member is always its owner. */
export interface BookingDto {
  readonly id: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: BookingStatus;
}

export function toBookingDto(row: BookingRow): BookingDto {
  return {
    id: row.id,
    resourceId: row.resourceId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
  };
}
