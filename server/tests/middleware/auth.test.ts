import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { createTestConfig } from '../helpers/testConfig.js';
import { createFakeMailer } from '../helpers/fakeMailer.js';
import { createSessionMiddleware } from '../../src/middleware/session.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createAuthRouter } from '../../src/routes/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  deactivateUserByEmail,
  extractTokenFromLink,
  promoteToAdminByEmail,
} from '../helpers/dbHelpers.js';

/**
 * requireVerified and requireAdmin have nothing mounted behind them yet in
 * the real app (that starts in Phase 2), so this builds a throwaway app with
 * two test-only routes guarded by each, alongside the real auth router --
 * so a real login (through real HTTP, a real session, a real cookie) is what
 * drives them, not a mocked request object.
 */
function buildGuardTestApp(pool: Pool) {
  const config = createTestConfig();
  const mailer = createFakeMailer();
  const app = express();

  app.use(express.json());
  app.use(createSessionMiddleware(pool, config));

  const auth = createAuthMiddleware(pool);
  app.use('/api/auth', createAuthRouter({ pool, config, mailer }, auth));

  app.get('/test/verified-only', ...auth.requireVerified, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/test/admin-only', ...auth.requireAdmin, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(errorHandler);
  return { app, mailer };
}

describe('auth guards (requireAuth / requireVerified / requireAdmin)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('requireAuth rejects a request with no session', async () => {
    const { app } = buildGuardTestApp(pool);
    const response = await request(app).get('/test/verified-only');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('requireVerified rejects a pending (unverified) session', async () => {
    const { app } = buildGuardTestApp(pool);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'ana@example.com',
      displayName: 'Ana',
      password: 'Correcthorse1',
    });
    await agent
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'Correcthorse1' });

    const response = await agent.get('/test/verified-only');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('requireVerified allows an active session through', async () => {
    const { app, mailer } = buildGuardTestApp(pool);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'ana@example.com',
      displayName: 'Ana',
      password: 'Correcthorse1',
    });
    const token = extractTokenFromLink(mailer.sent[0]!.text);
    await agent.post('/api/auth/verify-email').send({ token });

    const response = await agent.get('/test/verified-only');

    expect(response.status).toBe(200);
  });

  it('requireAdmin rejects a verified non-admin member', async () => {
    const { app, mailer } = buildGuardTestApp(pool);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'ana@example.com',
      displayName: 'Ana',
      password: 'Correcthorse1',
    });
    const token = extractTokenFromLink(mailer.sent[0]!.text);
    await agent.post('/api/auth/verify-email').send({ token });

    const response = await agent.get('/test/admin-only');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('requireAdmin allows a verified admin through', async () => {
    const { app, mailer } = buildGuardTestApp(pool);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'admin@example.com',
      displayName: 'Admin',
      password: 'Correcthorse1',
    });
    const token = extractTokenFromLink(mailer.sent[0]!.text);
    await agent.post('/api/auth/verify-email').send({ token });
    await promoteToAdminByEmail(pool, 'admin@example.com');

    const response = await agent.get('/test/admin-only');

    expect(response.status).toBe(200);
  });

  it('fails closed: deactivating a user invalidates their existing session on the next request', async () => {
    const { app, mailer } = buildGuardTestApp(pool);
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'ana@example.com',
      displayName: 'Ana',
      password: 'Correcthorse1',
    });
    const token = extractTokenFromLink(mailer.sent[0]!.text);
    await agent.post('/api/auth/verify-email').send({ token });

    // The session is valid at this point.
    const before = await agent.get('/test/verified-only');
    expect(before.status).toBe(200);

    // Deactivated directly (Phase 5 builds the real admin endpoint for this;
    // the guard's behaviour is what's under test here, not that endpoint).
    await deactivateUserByEmail(pool, 'ana@example.com');

    // The auth middleware re-reads status from the database on every
    // request rather than trusting what was true when the session was
    // created, so the very next request is rejected -- not eventually, now.
    const after = await agent.get('/test/verified-only');
    expect(after.status).toBe(401);
  });
});
