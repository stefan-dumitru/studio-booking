import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool, DatabaseError } from 'pg';
import {
  createTestPool,
  migrateTestDatabase,
  truncateAll,
} from '../helpers/testDb.js';

/**
 * The app's central promise is that two members cannot hold the same slot. That
 * promise is a database constraint, so it is tested with direct SQL and no
 * application code: if this fails, no amount of correct booking logic saves it,
 * and if it passes, no bug in the booking service can defeat it.
 *
 * See specifications/operations.md > Concurrency & Write Correctness.
 */

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

function errorCode(error: unknown): string | undefined {
  return (error as DatabaseError | undefined)?.code;
}

describe('booking_slots constraints', () => {
  let pool: Pool;
  let memberId: string;
  let otherMemberId: string;
  let resourceId: string;
  let otherResourceId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await migrateTestDatabase('up');
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);

    const members = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash, display_name, status, email_verified_at) ' +
        "VALUES ('ana@example.com', 'x', 'Ana', 'active', now()), " +
        "('ben@example.com', 'x', 'Ben', 'active', now()) RETURNING id",
    );
    memberId = members.rows[0]!.id;
    otherMemberId = members.rows[1]!.id;

    const type = await pool.query<{ id: string }>(
      "INSERT INTO resource_types (name) VALUES ('Rehearsal Room') RETURNING id",
    );

    const resources = await pool.query<{ id: string }>(
      'INSERT INTO resources (name, type_id, capacity, open_time, close_time) ' +
        "VALUES ('Room A', $1, 6, '08:00', '22:00'), " +
        "('Room B', $1, 4, '08:00', '22:00') RETURNING id",
      [type.rows[0]!.id],
    );
    resourceId = resources.rows[0]!.id;
    otherResourceId = resources.rows[1]!.id;
  });

  async function insertBooking(
    forMemberId: string,
    forResourceId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO bookings (resource_id, member_id, starts_at, ends_at) ' +
        'VALUES ($1, $2, $3, $4) RETURNING id',
      [forResourceId, forMemberId, startsAt, endsAt],
    );
    return result.rows[0]!.id;
  }

  async function claimSlot(
    bookingId: string,
    forResourceId: string,
    slotStart: string,
  ): Promise<void> {
    await pool.query(
      'INSERT INTO booking_slots (booking_id, resource_id, slot_start) VALUES ($1, $2, $3)',
      [bookingId, forResourceId, slotStart],
    );
  }

  it('rejects a second claim on the same resource and slot', async () => {
    const first = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );
    await claimSlot(first, resourceId, '2026-10-01T09:00:00Z');

    const second = await insertBooking(
      otherMemberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );

    let code: string | undefined;
    try {
      await claimSlot(second, resourceId, '2026-10-01T09:00:00Z');
    } catch (error) {
      code = errorCode(error);
    }

    expect(code).toBe(UNIQUE_VIOLATION);
  });

  it('allows the same slot on a different resource', async () => {
    const first = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );
    await claimSlot(first, resourceId, '2026-10-01T09:00:00Z');

    const second = await insertBooking(
      otherMemberId,
      otherResourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );

    await expect(
      claimSlot(second, otherResourceId, '2026-10-01T09:00:00Z'),
    ).resolves.toBeUndefined();
  });

  it('allows an adjacent slot on the same resource', async () => {
    const booking = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T10:00:00Z',
    );
    await claimSlot(booking, resourceId, '2026-10-01T09:00:00Z');

    await expect(
      claimSlot(booking, resourceId, '2026-10-01T09:30:00Z'),
    ).resolves.toBeUndefined();
  });

  it('rejects a slot whose resource disagrees with its booking', async () => {
    const booking = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );

    let code: string | undefined;
    try {
      // The composite foreign key catches this; a plain booking_id reference
      // would happily accept the wrong resource.
      await claimSlot(booking, otherResourceId, '2026-10-01T09:00:00Z');
    } catch (error) {
      code = errorCode(error);
    }

    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('rejects a slot that is not on a 30-minute boundary', async () => {
    const booking = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );

    let code: string | undefined;
    try {
      await claimSlot(booking, resourceId, '2026-10-01T09:17:00Z');
    } catch (error) {
      code = errorCode(error);
    }

    expect(code).toBe(CHECK_VIOLATION);
  });

  it('frees the slot when the claim is deleted, which is how cancellation works', async () => {
    const first = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );
    await claimSlot(first, resourceId, '2026-10-01T09:00:00Z');

    await pool.query('DELETE FROM booking_slots WHERE booking_id = $1', [first]);
    await pool.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = now(), " +
        'cancelled_by = $2 WHERE id = $1',
      [first, memberId],
    );

    const second = await insertBooking(
      otherMemberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );

    await expect(
      claimSlot(second, resourceId, '2026-10-01T09:00:00Z'),
    ).resolves.toBeUndefined();

    // The cancelled booking survives as history even though its slot is gone.
    const history = await pool.query<{ status: string }>(
      'SELECT status FROM bookings WHERE id = $1',
      [first],
    );
    expect(history.rows[0]!.status).toBe('cancelled');
  });

  it('cascades slot deletion when a booking row is deleted by the purge job', async () => {
    const booking = await insertBooking(
      memberId,
      resourceId,
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:30:00Z',
    );
    await claimSlot(booking, resourceId, '2026-10-01T09:00:00Z');

    await pool.query('DELETE FROM bookings WHERE id = $1', [booking]);

    const remaining = await pool.query('SELECT 1 FROM booking_slots');
    expect(remaining.rowCount).toBe(0);
  });
});
