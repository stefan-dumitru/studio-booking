import type { Pool, PoolClient } from 'pg';

/**
 * Runs fn inside BEGIN/COMMIT, rolling back on any throw. Used by every
 * service that needs an all-or-nothing multi-step write
 * (specifications/operations.md > Concurrency & Write Correctness >
 * Transaction boundaries).
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      // The connection may already be unusable (e.g. it dropped mid-transaction);
      // the original error is what matters and is rethrown below regardless.
    });
    throw error;
  } finally {
    client.release();
  }
}
