import { Router } from 'express';
import type { Pool } from 'pg';

/**
 * GET /api/health
 *
 * Verifies the database is reachable, not merely that the process is alive: a
 * Node process that cannot reach Postgres is useless and should fail its check
 * (specifications/operations.md > Observability).
 *
 * Deliberately unauthenticated, and deliberately returns no version, hostname
 * or environment detail -- it is reachable by anything that can reach the app.
 */
export function createHealthRouter(pool: Pool): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ok', db: 'ok' });
    } catch (error) {
      // The reason goes to the log, never to the response body.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'health check failed',
          err: error instanceof Error ? error.message : String(error),
        }),
      );
      res.status(503).json({ status: 'degraded', db: 'unreachable' });
    }
  });

  return router;
}
