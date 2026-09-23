import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import { createHealthRouter } from './routes/health.js';

export interface AppDependencies {
  readonly pool: Pool;
}

/**
 * Builds the Express app around its dependencies rather than importing a
 * module-level singleton.
 *
 * This is what makes the database-down case testable: a test can hand in a pool
 * pointed at a closed port and assert a 503. With a singleton there would be no
 * way to reach that branch without breaking the real database.
 */
export function createApp({ pool }: AppDependencies): Express {
  const app = express();

  // Express 5 sends its own X-Powered-By otherwise, which tells an attacker the
  // stack for free.
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createHealthRouter(pool));

  return app;
}
