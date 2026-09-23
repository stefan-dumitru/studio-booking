import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

/**
 * Timeouts exist so a pathological query or an unreachable database fails fast
 * instead of pinning a connection or hanging a request
 * (specifications/operations.md > External Integrations).
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;

export interface PoolOptions {
  readonly connectionString: string;
  /** Overridable so tests can fail fast instead of waiting five seconds. */
  readonly connectionTimeoutMillis?: number;
  readonly max?: number;
}

export function createPool(options: PoolOptions): Pool {
  const config: PoolConfig = {
    connectionString: options.connectionString,
    statement_timeout: DEFAULT_STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    max: options.max ?? 10,
  };

  const pool = new Pool(config);

  // An error on an idle client is emitted on the pool, not on any query. Without
  // a listener Node treats it as an unhandled 'error' event and kills the
  // process -- so a database restart would take the app down with it.
  pool.on('error', (error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'idle database client error',
        err: error.message,
      }),
    );
  });

  return pool;
}
