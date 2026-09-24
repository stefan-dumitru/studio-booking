import type { Queryable } from '../types.js';

export interface ResourceWindowRow {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly capacity: number;
  /** UTC instants -- the intersection of the resource's own hours and the
   * request's from/to filter, computed entirely in SQL (see doc comment on
   * listResourcesWithWindows). windowStart >= windowEnd means "no slots". */
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

interface RawResourceWindowRow {
  id: string;
  name: string;
  type_id: string;
  capacity: number;
  window_start: Date;
  window_end: Date;
}

function mapWindowRow(row: RawResourceWindowRow): ResourceWindowRow {
  return {
    id: row.id,
    name: row.name,
    typeId: row.type_id,
    capacity: row.capacity,
    windowStart: row.window_start,
    windowEnd: row.window_end,
  };
}

export interface ListResourcesWithWindowsOptions {
  /** Studio-local calendar date, "YYYY-MM-DD". */
  readonly date: string;
  readonly studioTimeZone: string;
  readonly typeIds: readonly string[] | null;
  /** Studio-local "HH:MM", optional -- narrows the window, never widens it. */
  readonly from: string | null;
  readonly to: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface ListResourcesWithWindowsResult {
  readonly rows: readonly ResourceWindowRow[];
  readonly total: number;
}

/**
 * The one query that does the DST-sensitive work: `AT TIME ZONE` resolves
 * "date + time-of-day" to a real UTC instant using Postgres's own IANA
 * timezone database, correctly across the spring-forward/fall-back
 * transitions (functional.md > Slot generation & DST). Application code
 * never does this arithmetic itself -- it only walks windowStart to
 * windowEnd in fixed 30-minute steps on the resulting plain UTC instants.
 *
 * from/to are intersected with the resource's own open/close via
 * GREATEST/LEAST rather than applied as a WHERE filter, so a resource whose
 * hours don't overlap the requested window still comes back with an empty
 * (windowStart >= windowEnd) range instead of vanishing from the list --
 * "a resource with no slots in the requested window is still returned"
 * (functional.md > Browse availability).
 *
 * Ordered by resource_types.sort_order then resources.name
 * (ui-guidelines.md > breakpoints), which is why this joins resource_types
 * rather than living in resources.ts.
 */
export async function listResourcesWithWindows(
  db: Queryable,
  options: ListResourcesWithWindowsOptions,
): Promise<ListResourcesWithWindowsResult> {
  const hasTypeFilter = Boolean(options.typeIds && options.typeIds.length > 0);

  // Two independent parameter lists -- the count query doesn't need date,
  // zone, from or to at all (they only feed the window expressions, which
  // the count query has no use for), so it gets its own $1 numbering rather
  // than reusing a slice of the main query's array. Mixing the two was an
  // earlier bug here: a query whose text has zero "$N" placeholders still
  // gets sent that many bind parameters, and Postgres rejects the mismatch.
  const typeCondition = hasTypeFilter ? 'AND r.type_id = ANY($1)' : '';
  const countParams = hasTypeFilter ? [options.typeIds] : [];

  const mainParams: unknown[] = [
    options.date,
    options.studioTimeZone,
    options.from ?? '00:00',
    options.to ?? '24:00',
  ];
  const fromParam = '$3';
  const toParam = '$4';

  let mainTypeCondition = '';
  if (hasTypeFilter) {
    mainParams.push(options.typeIds);
    mainTypeCondition = `AND r.type_id = ANY($${mainParams.length})`;
  }

  mainParams.push(options.limit);
  const limitParam = `$${mainParams.length}`;
  mainParams.push(options.offset);
  const offsetParam = `$${mainParams.length}`;

  const windowExpr = `
    GREATEST(
      ($1::date + r.open_time) AT TIME ZONE $2,
      ($1::date + ${fromParam}::time) AT TIME ZONE $2
    ) AS window_start,
    LEAST(
      ($1::date + r.close_time) AT TIME ZONE $2,
      -- 24:00 is not a valid TIME literal; midnight-next-day is expressed as
      -- date+1 at 00:00 instead, so an unset "to" filter never clips a
      -- resource that closes at or after midnight.. it can't, per the
      -- overnight-window ban, but this keeps the expression well-defined.
      CASE WHEN ${toParam} = '24:00'
        THEN (($1::date + 1) AT TIME ZONE $2)
        ELSE ($1::date + ${toParam}::time) AT TIME ZONE $2
      END
    ) AS window_end`;

  const [rowsResult, countResult] = await Promise.all([
    db.query<RawResourceWindowRow>(
      `SELECT r.id, r.name, r.type_id, r.capacity, ${windowExpr}
         FROM resources r
         JOIN resource_types rt ON rt.id = r.type_id
        WHERE r.archived_at IS NULL ${mainTypeCondition}
        ORDER BY rt.sort_order ASC, r.name ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      mainParams,
    ),
    db.query<{ count: string }>(
      `SELECT count(*) AS count FROM resources r WHERE r.archived_at IS NULL ${typeCondition}`,
      countParams,
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapWindowRow),
    total: Number(countResult.rows[0]?.count ?? '0'),
  };
}

export interface BookedSlotRow {
  readonly resourceId: string;
  readonly slotStart: Date;
  readonly memberId: string;
}

/**
 * Returns raw member ids, never names -- the privacy boundary
 * (security.md > Authorization) is enforced by never letting this value
 * travel further than the one mapping step in
 * services/availability.ts that turns it into 'mine' or 'booked'.
 */
export async function listBookedSlotsForResources(
  db: Queryable,
  resourceIds: readonly string[],
  dayStartUtc: Date,
  dayEndUtc: Date,
): Promise<BookedSlotRow[]> {
  if (resourceIds.length === 0) return [];

  const result = await db.query<{
    resource_id: string;
    slot_start: Date;
    member_id: string;
  }>(
    `SELECT bs.resource_id, bs.slot_start, b.member_id
       FROM booking_slots bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE bs.resource_id = ANY($1)
        AND bs.slot_start >= $2
        AND bs.slot_start < $3`,
    [resourceIds, dayStartUtc, dayEndUtc],
  );

  return result.rows.map((row) => ({
    resourceId: row.resource_id,
    slotStart: row.slot_start,
    memberId: row.member_id,
  }));
}
