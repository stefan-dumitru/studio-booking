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

export type BookingScope = 'upcoming' | 'past';

export interface BookingWithResourceRow extends BookingRow {
  readonly resourceName: string;
}

interface RawBookingWithResourceRow extends RawBookingRow {
  resource_name: string;
}

function mapWithResourceRow(row: RawBookingWithResourceRow): BookingWithResourceRow {
  return { ...mapRow(row), resourceName: row.resource_name };
}

export interface ListBookingsForMemberOptions {
  readonly memberId: string;
  readonly scope: BookingScope;
  readonly limit: number;
  readonly offset: number;
}

export interface ListBookingsForMemberResult {
  readonly rows: readonly BookingWithResourceRow[];
  readonly total: number;
}

/**
 * "Upcoming" and "past" are a single condition and its negation, not two
 * independent filters -- that's what guarantees every booking lands in
 * exactly one of the two lists, including a *cancelled* future booking
 * (which isn't upcoming any more, and has nowhere else to go but past).
 * Joins resources for the display name: there's no other place a member's
 * bookings list gets "what did I book" from.
 */
export async function listBookingsForMember(
  db: Queryable,
  options: ListBookingsForMemberOptions,
): Promise<ListBookingsForMemberResult> {
  const isUpcoming = options.scope === 'upcoming';
  const condition = isUpcoming
    ? `b.status = 'booked' AND b.ends_at > now()`
    : `NOT (b.status = 'booked' AND b.ends_at > now())`;
  const order = isUpcoming ? 'b.starts_at ASC' : 'b.starts_at DESC';

  const rowsResult = await db.query<RawBookingWithResourceRow>(
    `SELECT b.*, r.name AS resource_name
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
      WHERE b.member_id = $1 AND ${condition}
      ORDER BY ${order}
      LIMIT $2 OFFSET $3`,
    [options.memberId, options.limit, options.offset],
  );
  const countResult = await db.query<{ count: string }>(
    `SELECT count(*) AS count
       FROM bookings b
      WHERE b.member_id = $1 AND ${condition}`,
    [options.memberId],
  );

  return {
    rows: rowsResult.rows.map(mapWithResourceRow),
    total: Number(countResult.rows[0]?.count ?? '0'),
  };
}

/**
 * Locks the single booking row for the duration of a cancellation
 * transaction -- same single-row-lock pattern as
 * lockResourceForBookingCheck/lockUserForBookingCheck. This is what makes a
 * double-clicked cancel resolve deterministically: the second request
 * blocks here until the first commits, then reads status = 'cancelled' and
 * takes the idempotent no-op path itself instead of racing the first
 * request's writes (operations.md > "cancelling an already-cancelled
 * booking returns 200... the booking id is the idempotency key").
 */
export async function lockBookingForCancel(
  db: Queryable,
  id: string,
): Promise<BookingRow | null> {
  const result = await db.query<RawBookingRow>(
    `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markBookingCancelled(
  db: Queryable,
  id: string,
  cancelledBy: string,
): Promise<BookingRow> {
  const result = await db.query<RawBookingRow>(
    `UPDATE bookings
        SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2
      WHERE id = $1
      RETURNING *`,
    [id, cancelledBy],
  );
  const row = result.rows[0];
  if (!row) throw new Error('markBookingCancelled: UPDATE ... RETURNING produced no row');
  return mapRow(row);
}

/** The statement that actually frees the slot -- deleting these rows is
 * what a booked slot becoming bookable again means (operations.md >
 * Concurrency & Write Correctness). */
export async function deleteBookingSlotsForBooking(
  db: Queryable,
  bookingId: string,
): Promise<void> {
  await db.query(`DELETE FROM booking_slots WHERE booking_id = $1`, [bookingId]);
}
