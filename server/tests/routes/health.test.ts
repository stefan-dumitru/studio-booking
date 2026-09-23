import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createApp } from '../../src/app.js';
import { createTestPool } from '../helpers/testDb.js';

/**
 * The health endpoint's whole point is the unhappy path: it must report the
 * database being unreachable rather than claiming the app is fine because the
 * process is running.
 *
 * This is testable only because createApp takes its pool as an argument -- with
 * a module-level singleton there would be no way to reach the 503 branch.
 */
describe('GET /api/health', () => {
  describe('with a reachable database', () => {
    let pool: Pool;

    beforeAll(() => {
      pool = createTestPool();
    });

    afterAll(async () => {
      await pool.end();
    });

    it('returns 200 and reports the database as ok', async () => {
      const response = await request(createApp({ pool })).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', db: 'ok' });
    });

    it('leaks no version, hostname or environment detail', async () => {
      const response = await request(createApp({ pool })).get('/api/health');

      expect(Object.keys(response.body).sort()).toEqual(['db', 'status']);
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('with an unreachable database', () => {
    let brokenPool: Pool;

    beforeAll(() => {
      // Port 1 is reserved and nothing listens on it, so connecting fails fast.
      brokenPool = new Pool({
        connectionString: 'postgres://nobody:nothing@127.0.0.1:1/missing',
        connectionTimeoutMillis: 2_000,
      });
      // Without this listener the failed connection would be an unhandled
      // 'error' event on the pool and would take the test process down.
      brokenPool.on('error', () => {});
    });

    afterAll(async () => {
      await brokenPool.end().catch(() => {});
    });

    it('returns 503 and reports the database as unreachable', async () => {
      const response = await request(createApp({ pool: brokenPool })).get(
        '/api/health',
      );

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'degraded', db: 'unreachable' });
    });

    it('does not leak the connection error into the response', async () => {
      const response = await request(createApp({ pool: brokenPool })).get(
        '/api/health',
      );

      expect(JSON.stringify(response.body)).not.toMatch(
        /127\.0\.0\.1|ECONNREFUSED|nobody/,
      );
    });
  });
});
