import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import {
  createTestPool,
  listTables,
  migrateTestDatabase,
} from './helpers/testDb.js';

/**
 * "Every migration is reversible" is an intention until something proves it.
 * This walks the whole stack up, then all the way back down, then up again --
 * which also leaves the database ready for whichever suite runs next.
 */

const EXPECTED_TABLES = [
  'audit_log',
  'booking_slots',
  'bookings',
  'email_tokens',
  'resource_types',
  'resources',
  'session',
  'users',
];

describe('migrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await migrateTestDatabase('down');
  });

  afterAll(async () => {
    await migrateTestDatabase('up');
    await pool.end();
  });

  it('creates every expected table on the way up', async () => {
    await migrateTestDatabase('up');

    expect(await listTables(pool)).toEqual(EXPECTED_TABLES);
  });

  it('removes every table on the way back down', async () => {
    await migrateTestDatabase('up');
    await migrateTestDatabase('down');

    expect(await listTables(pool)).toEqual([]);
  });

  it('can be re-applied after a full rollback', async () => {
    await migrateTestDatabase('up');
    await migrateTestDatabase('down');
    await migrateTestDatabase('up');

    expect(await listTables(pool)).toEqual(EXPECTED_TABLES);
  });

  it('installs the citext extension that case-insensitive email relies on', async () => {
    await migrateTestDatabase('up');

    const result = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'citext'",
    );

    expect(result.rowCount).toBe(1);
  });

  it('creates the indexes the documented query plans depend on', async () => {
    await migrateTestDatabase('up');

    const result = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );
    const indexes = result.rows.map((row) => row.indexname);

    // The one that matters most: both the uniqueness guarantee and the
    // availability lookup depend on it.
    expect(indexes).toContain('booking_slots_pkey');
    expect(indexes).toContain('bookings_member_starts_idx');
    expect(indexes).toContain('bookings_resource_future_idx');
    expect(indexes).toContain('resources_type_active_idx');
  });
});
