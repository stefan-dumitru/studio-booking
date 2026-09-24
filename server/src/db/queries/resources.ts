import type { ConflictingBookingDto, Queryable, ResourceRow } from '../types.js';

interface RawResourceRow {
  id: string;
  name: string;
  type_id: string;
  description: string;
  capacity: number;
  open_time: string;
  close_time: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RawResourceRow): ResourceRow {
  return {
    id: row.id,
    name: row.name,
    typeId: row.type_id,
    description: row.description,
    capacity: row.capacity,
    openTime: row.open_time,
    closeTime: row.close_time,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertResourceInput {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
}

export async function insertResource(
  db: Queryable,
  input: InsertResourceInput,
): Promise<ResourceRow> {
  const result = await db.query<RawResourceRow>(
    `INSERT INTO resources (name, type_id, description, capacity, open_time, close_time)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.name,
      input.typeId,
      input.description,
      input.capacity,
      input.openTime,
      input.closeTime,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertResource: INSERT ... RETURNING produced no row');
  return mapRow(row);
}

export async function findResourceById(
  db: Queryable,
  id: string,
): Promise<ResourceRow | null> {
  const result = await db.query<RawResourceRow>(
    'SELECT * FROM resources WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Locks the resource row exclusively for the duration of the caller's
 * transaction -- used by archive and edit (operations.md > Concurrency &
 * Write Correctness, race #2/#3). Two admins editing the same resource
 * serialise too, which is fine at one-admin scale (operations.md accepts
 * this deliberately).
 */
export async function lockResourceForWrite(
  db: Queryable,
  id: string,
): Promise<ResourceRow | null> {
  const result = await db.query<RawResourceRow>(
    'SELECT * FROM resources WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Locks the resource row non-exclusively (FOR SHARE) for the duration of a
 * booking-creation transaction -- lets many concurrent bookings on the same
 * resource proceed together, while still blocking until any concurrent
 * archive or hours edit (which take the exclusive lock above) commits or
 * rolls back first. This is what closes race #2/#3 from the booking side.
 */
export interface ResourceBookingWindow extends ResourceRow {
  /** The resource's open/close window, as UTC instants, on the local
   * calendar date `date` names -- computed the same DST-safe way as
   * listResourcesWithWindows, folded into this same locked read rather than
   * a separate query (operations.md's booking-creation query budget doesn't
   * have room for one). */
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

/**
 * FOR SHARE locks the resource for the duration of a booking-creation
 * transaction (see lockResourceForWrite's comment for the exclusive
 * counterpart) and, in the same query, resolves its opening window on the
 * given studio-local calendar date -- the caller passes the date derived
 * from the booking's own startsAt (a UTC instant -> local-date conversion,
 * which has no DST ambiguity, unlike the reverse).
 */
export async function lockResourceForBookingCheck(
  db: Queryable,
  id: string,
  date: string,
  studioTimeZone: string,
): Promise<ResourceBookingWindow | null> {
  const result = await db.query<
    RawResourceRow & { window_start: Date; window_end: Date }
  >(
    `SELECT r.*,
            ($2::date + r.open_time) AT TIME ZONE $3 AS window_start,
            ($2::date + r.close_time) AT TIME ZONE $3 AS window_end
       FROM resources r
      WHERE r.id = $1
      FOR SHARE`,
    [id, date, studioTimeZone],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapRow(row),
    windowStart: row.window_start,
    windowEnd: row.window_end,
  };
}

export interface UpdateResourceInput {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
}

export async function updateResource(
  db: Queryable,
  id: string,
  input: UpdateResourceInput,
): Promise<ResourceRow> {
  const result = await db.query<RawResourceRow>(
    `UPDATE resources
        SET name = $2, type_id = $3, description = $4, capacity = $5,
            open_time = $6, close_time = $7
      WHERE id = $1
      RETURNING *`,
    [
      id,
      input.name,
      input.typeId,
      input.description,
      input.capacity,
      input.openTime,
      input.closeTime,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`updateResource: no resource with id ${id}`);
  return mapRow(row);
}

export async function archiveResourceRow(db: Queryable, id: string): Promise<void> {
  await db.query('UPDATE resources SET archived_at = now() WHERE id = $1', [id]);
}

export async function unarchiveResourceRow(
  db: Queryable,
  id: string,
): Promise<void> {
  await db.query('UPDATE resources SET archived_at = NULL WHERE id = $1', [id]);
}

/** The archive-block check: future, still-booked bookings on this resource. */
export async function countFutureActiveBookings(
  db: Queryable,
  resourceId: string,
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM bookings
      WHERE resource_id = $1 AND status = 'booked' AND ends_at > now()`,
    [resourceId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

/**
 * The warn-then-allow check on an hours edit: future active bookings whose
 * studio-local start or end falls outside the proposed window. studioTimeZone
 * comes from config, never hardcoded (functional.md > Slot generation & DST).
 */
export async function findBookingsOutsideHours(
  db: Queryable,
  resourceId: string,
  studioTimeZone: string,
  openTime: string,
  closeTime: string,
): Promise<ConflictingBookingDto[]> {
  const result = await db.query<{
    id: string;
    starts_at: Date;
    ends_at: Date;
    display_name: string;
  }>(
    `SELECT b.id, b.starts_at, b.ends_at, u.display_name
       FROM bookings b
       JOIN users u ON u.id = b.member_id
      WHERE b.resource_id = $1
        AND b.status = 'booked'
        AND b.ends_at > now()
        AND (
          (b.starts_at AT TIME ZONE $2)::time < $3::time
          OR (b.ends_at AT TIME ZONE $2)::time > $4::time
        )
      ORDER BY b.starts_at ASC`,
    [resourceId, studioTimeZone, openTime, closeTime],
  );

  return result.rows.map((row) => ({
    bookingId: row.id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    memberDisplayName: row.display_name,
  }));
}

/** Same shape as findBookingsOutsideHours' result, for the archive-block response. */
export async function findFutureActiveBookingsWithMember(
  db: Queryable,
  resourceId: string,
): Promise<ConflictingBookingDto[]> {
  const result = await db.query<{
    id: string;
    starts_at: Date;
    ends_at: Date;
    display_name: string;
  }>(
    `SELECT b.id, b.starts_at, b.ends_at, u.display_name
       FROM bookings b
       JOIN users u ON u.id = b.member_id
      WHERE b.resource_id = $1 AND b.status = 'booked' AND b.ends_at > now()
      ORDER BY b.starts_at ASC`,
    [resourceId],
  );

  return result.rows.map((row) => ({
    bookingId: row.id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    memberDisplayName: row.display_name,
  }));
}

export type ResourceStatusFilter = 'active' | 'archived' | 'all';

export interface ListResourcesOptions {
  readonly q: string;
  readonly typeId: string | null;
  readonly status: ResourceStatusFilter;
  readonly limit: number;
  readonly offset: number;
}

export interface ListResourcesResult {
  readonly rows: readonly ResourceRow[];
  readonly total: number;
}

export async function listResources(
  db: Queryable,
  options: ListResourcesOptions,
): Promise<ListResourcesResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.q.trim()) {
    params.push(`%${options.q.trim()}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (options.typeId) {
    params.push(options.typeId);
    conditions.push(`type_id = $${params.length}`);
  }
  if (options.status === 'active') {
    conditions.push('archived_at IS NULL');
  } else if (options.status === 'archived') {
    conditions.push('archived_at IS NOT NULL');
  }
  // status === 'all': no condition.

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(options.limit);
  const limitParam = `$${params.length}`;
  params.push(options.offset);
  const offsetParam = `$${params.length}`;

  const [rowsResult, countResult] = await Promise.all([
    db.query<RawResourceRow>(
      `SELECT * FROM resources ${whereClause}
        ORDER BY name ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    ),
    db.query<{ count: string }>(
      `SELECT count(*) AS count FROM resources ${whereClause}`,
      params.slice(0, params.length - 2),
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapRow),
    total: Number(countResult.rows[0]?.count ?? '0'),
  };
}
