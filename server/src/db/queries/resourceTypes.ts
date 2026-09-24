import type { Queryable, ResourceTypeRow } from '../types.js';

interface RawResourceTypeRow {
  id: string;
  name: string;
  sort_order: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RawResourceTypeRow): ResourceTypeRow {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertResourceTypeInput {
  readonly name: string;
  readonly sortOrder: number;
}

export async function insertResourceType(
  db: Queryable,
  input: InsertResourceTypeInput,
): Promise<ResourceTypeRow> {
  const result = await db.query<RawResourceTypeRow>(
    'INSERT INTO resource_types (name, sort_order) VALUES ($1, $2) RETURNING *',
    [input.name, input.sortOrder],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error('insertResourceType: INSERT ... RETURNING produced no row');
  return mapRow(row);
}

export async function findResourceTypeById(
  db: Queryable,
  id: string,
): Promise<ResourceTypeRow | null> {
  const result = await db.query<RawResourceTypeRow>(
    'SELECT * FROM resource_types WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export interface UpdateResourceTypeInput {
  readonly name: string;
  readonly sortOrder: number;
}

export async function updateResourceType(
  db: Queryable,
  id: string,
  input: UpdateResourceTypeInput,
): Promise<ResourceTypeRow> {
  const result = await db.query<RawResourceTypeRow>(
    'UPDATE resource_types SET name = $2, sort_order = $3 WHERE id = $1 RETURNING *',
    [id, input.name, input.sortOrder],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`updateResourceType: no resource_type with id ${id}`);
  return mapRow(row);
}

export async function archiveResourceTypeRow(
  db: Queryable,
  id: string,
): Promise<void> {
  await db.query('UPDATE resource_types SET archived_at = now() WHERE id = $1', [
    id,
  ]);
}

export async function unarchiveResourceTypeRow(
  db: Queryable,
  id: string,
): Promise<void> {
  await db.query('UPDATE resource_types SET archived_at = NULL WHERE id = $1', [
    id,
  ]);
}

/** The archive-block check: any non-archived resource still pointing at this type. */
export async function countActiveResourcesForType(
  db: Queryable,
  typeId: string,
): Promise<number> {
  const result = await db.query<{ count: string }>(
    'SELECT count(*) AS count FROM resources WHERE type_id = $1 AND archived_at IS NULL',
    [typeId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

export interface ListResourceTypesOptions {
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface ListResourceTypesResult {
  readonly rows: readonly ResourceTypeRow[];
  readonly total: number;
}

export async function listResourceTypes(
  db: Queryable,
  options: ListResourceTypesOptions,
): Promise<ListResourceTypesResult> {
  const whereClause = options.includeArchived ? '' : 'WHERE archived_at IS NULL';

  const [rowsResult, countResult] = await Promise.all([
    db.query<RawResourceTypeRow>(
      `SELECT * FROM resource_types ${whereClause}
        ORDER BY sort_order ASC, name ASC
        LIMIT $1 OFFSET $2`,
      [options.limit, options.offset],
    ),
    db.query<{ count: string }>(
      `SELECT count(*) AS count FROM resource_types ${whereClause}`,
    ),
  ]);

  return {
    rows: rowsResult.rows.map(mapRow),
    total: Number(countResult.rows[0]?.count ?? '0'),
  };
}
