import type { BookingRow, Queryable } from '../types.js';

interface RawBookingRow {
  id: string;
  resource_id: string;
  member_id: string;
  starts_at: Date;
  ends_at: Date;
  status: 'booked' | 'cancelled';
  cancelled_at: Date | null;
  cancelled_by: string | null;
  created_at: Date;
}

function mapRow(row: RawBookingRow): BookingRow {
  return {
    id: row.id,
    resourceId: row.resource_id,
    memberId: row.member_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
  };
}

/** The 3-active-bookings cap: status='booked' and still in the future
 * (functional.md > Create a booking -- past and cancelled don't count). */
export async function countActiveBookingsForMember(
  db: Queryable,
  memberId: string,
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM bookings
      WHERE member_id = $1 AND status = 'booked' AND ends_at > now()`,
    [memberId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

/**
 * The pre-check for a friendly SLOT_TAKEN message in the common (non-racing)
 * case -- NOT the control. The unique constraint on booking_slots is what
 * actually prevents a double-booking; see insertBookingSlots below and
 * operations.md > Concurrency & Write Correctness.
 */
export async function findAlreadyTakenSlots(
  db: Queryable,
  resourceId: string,
  slotStarts: readonly Date[],
): Promise<Date[]> {
  const result = await db.query<{ slot_start: Date }>(
    `SELECT slot_start FROM booking_slots
      WHERE resource_id = $1 AND slot_start = ANY($2::timestamptz[])`,
    [resourceId, slotStarts],
  );
  return result.rows.map((row) => row.slot_start);
}

export interface InsertBookingInput {
  readonly resourceId: string;
  readonly memberId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export async function insertBooking(
  db: Queryable,
  input: InsertBookingInput,
): Promise<BookingRow> {
  const result = await db.query<RawBookingRow>(
    `INSERT INTO bookings (resource_id, member_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.resourceId, input.memberId, input.startsAt, input.endsAt],
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertBooking: INSERT ... RETURNING produced no row');
  return mapRow(row);
}

/**
 * One multi-row insert via unnest -- atomic, and this is the actual
 * double-booking control: PRIMARY KEY (resource_id, slot_start) on
 * booking_slots raises 23505 on the first conflicting row and aborts the
 * whole statement, so a booking never ends up holding some of its slots but
 * not others.
 */
export async function insertBookingSlots(
  db: Queryable,
  bookingId: string,
  resourceId: string,
  slotStarts: readonly Date[],
): Promise<void> {
  await db.query(
    `INSERT INTO booking_slots (booking_id, resource_id, slot_start)
     SELECT $1, $2, unnest($3::timestamptz[])`,
    [bookingId, resourceId, slotStarts],
  );
}
