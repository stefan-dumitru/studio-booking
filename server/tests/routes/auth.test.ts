import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool, truncateAll } from '../helpers/testDb.js';
import { buildTestApp } from '../helpers/testApp.js';
import type { FakeMailer } from '../helpers/fakeMailer.js';
import {
  deactivateUserByEmail,
  expireAllTokensForEmail,
  extractTokenFromLink,
  sessionCountForUserId,
  userExistsByEmail,
} from '../helpers/dbHelpers.js';

const STRONG_PASSWORD = 'Correcthorse1';
const OTHER_STRONG_PASSWORD = 'Battery2Staple';

describe('auth routes', () => {
  let pool: Pool;
  let app: Express;
  let mailer: FakeMailer;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  // A fresh app per test gives each one its own rate-limit counters (see
  // rateLimit.ts) as well as a clean database, so tests never depend on
  // execution order or on how much budget a sibling test already spent.
  beforeEach(async () => {
    await truncateAll(pool);
    ({ app, mailer } = buildTestApp(pool));
  });

  async function registerUser(
    email: string,
    displayName = 'Ana Test',
    password = STRONG_PASSWORD,
  ) {
    return request(app)
      .post('/api/auth/register')
      .send({ email, displayName, password });
  }

  function verifyLinkFor(email: string): string {
    const message = mailer.sent.find((m) => m.to === email);
    if (!message) throw new Error(`No mail sent to ${email}`);
    return extractTokenFromLink(message.text);
  }

  describe('POST /register', () => {
    it('creates a pending account and emails a verification link', async () => {
      const response = await registerUser('ana@example.com');

      expect(response.status).toBe(201);
      expect(await userExistsByEmail(pool, 'ana@example.com')).toBe(true);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]?.to).toBe('ana@example.com');
      expect(mailer.sent[0]?.subject).toMatch(/verify/i);
    });

    it('rejects a second registration with the same email', async () => {
      await registerUser('ana@example.com');
      const response = await registerUser('ana@example.com');

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('rejects a weak password with every problem at once', async () => {
      const response = await registerUser('ana@example.com', 'Ana', 'short');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(
        response.body.problems.some((p: string) => /8 characters/.test(p)),
      ).toBe(true);
      expect(response.body.problems.some((p: string) => /uppercase/.test(p))).toBe(
        true,
      );
      expect(response.body.problems.some((p: string) => /digit/.test(p))).toBe(
        true,
      );
    });

    it('rolls back the account when the mail send fails', async () => {
      mailer.failNext();
      const response = await registerUser('ana@example.com');

      expect(response.status).toBe(500);
      // The specific failure mode operations.md calls out: no half-created,
      // unverifiable, permanently-taken email address.
      expect(await userExistsByEmail(pool, 'ana@example.com')).toBe(false);
    });
  });

  describe('POST /resend-verification', () => {
    it('always responds the same way regardless of whether the account exists', async () => {
      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'nobody@example.com' });

      expect(response.status).toBe(200);
      expect(mailer.sent).toHaveLength(0);
    });

    it('issues a fresh token and invalidates the old one', async () => {
      await registerUser('ana@example.com');
      const oldToken = verifyLinkFor('ana@example.com');

      const response = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'ana@example.com' });
      expect(response.status).toBe(200);
      expect(mailer.sent).toHaveLength(2);

      const oldAttempt = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: oldToken });
      expect(oldAttempt.status).toBe(400);
      expect(oldAttempt.body.code).toBe('TOKEN_ALREADY_USED');
    });
  });

  describe('POST /verify-email', () => {
    it('activates the account and logs the member in', async () => {
      await registerUser('ana@example.com');
      const token = verifyLinkFor('ana@example.com');

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body.user.status).toBe('active');
      expect(response.body.user.emailVerifiedAt).not.toBeNull();
      expect(response.body.csrfToken).toEqual(expect.any(String));
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects an already-used token', async () => {
      await registerUser('ana@example.com');
      const token = verifyLinkFor('ana@example.com');
      await request(app).post('/api/auth/verify-email').send({ token });

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TOKEN_ALREADY_USED');
    });

    it('rejects an unknown token', async () => {
      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-real-token' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TOKEN_INVALID');
    });

    it('rejects an expired token', async () => {
      await registerUser('ana@example.com');
      const token = verifyLinkFor('ana@example.com');
      await expireAllTokensForEmail(pool, 'ana@example.com');

      const response = await request(app)
        .post('/api/auth/verify-email')
        .send({ token });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /login', () => {
    it('succeeds for a pending (unverified) account -- gated later by requireVerified', async () => {
      await registerUser('ana@example.com');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.user.status).toBe('pending_verification');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('succeeds for an active account', async () => {
      await registerUser('ana@example.com');
      await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verifyLinkFor('ana@example.com') });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.user.status).toBe('active');
    });

    it('fails with a generic message for a wrong password', async () => {
      await registerUser('ana@example.com');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
      const genericMessage = response.body.message as string;

      const unknownEmailResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPassword1' });
      // Same wording for wrong-password and unknown-email -- a distinct
      // message would be a membership oracle (security.md > Authentication).
      expect(unknownEmailResponse.body.message).toBe(genericMessage);
    });

    it('fails with the same generic message for a deactivated account', async () => {
      await registerUser('ana@example.com');
      await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verifyLinkFor('ana@example.com') });
      await deactivateUserByEmail(pool, 'ana@example.com');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rate-limits repeated attempts against one app instance', async () => {
      await registerUser('ana@example.com');
      const attempt = () =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'ana@example.com', password: 'WrongPassword1' });

      // The configured threshold is 10 per window (server/src/middleware/rateLimit.ts).
      for (let i = 0; i < 10; i += 1) {
        const response = await attempt();
        expect(response.status).toBe(401);
      }

      const eleventh = await attempt();
      expect(eleventh.status).toBe(429);
      expect(eleventh.body.code).toBe('RATE_LIMITED');
    });

    it('gives a fresh app instance its own, unaffected counters', async () => {
      // Exhausts the limiter on one app instance...
      await registerUser('ana@example.com');
      for (let i = 0; i < 10; i += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'ana@example.com', password: 'WrongPassword1' });
      }
      const blocked = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'WrongPassword1' });
      expect(blocked.status).toBe(429);

      // ...a second, independently-built app is unaffected, matching what a
      // fresh process boot (or a genuinely different client IP) looks like.
      const { app: otherApp } = buildTestApp(pool);
      const fromOtherApp = await request(otherApp)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'WrongPassword1' });
      expect(fromOtherApp.status).toBe(401);
    });
  });

  describe('GET /me', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(401);
    });

    it('returns the current user without the password hash', async () => {
      await registerUser('ana@example.com');
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      const response = await agent.get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('ana@example.com');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('returns a usable CSRF token even for a session that only ever called /me', async () => {
      // Simulates a page reload: the client only ever learns the session
      // exists via /me, never via login's response body directly.
      await registerUser('ana@example.com');
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      const meResponse = await agent.get('/api/auth/me');
      const csrfToken = meResponse.body.csrfToken as string;
      expect(csrfToken).toEqual(expect.any(String));

      const logoutResponse = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrfToken);
      expect(logoutResponse.status).toBe(200);
    });
  });

  describe('POST /logout', () => {
    it('rejects an unauthenticated request', async () => {
      const response = await request(app).post('/api/auth/logout');
      expect(response.status).toBe(401);
    });

    it('rejects a missing or wrong CSRF token', async () => {
      await registerUser('ana@example.com');
      const agent = request.agent(app);
      await agent
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });

      const missing = await agent.post('/api/auth/logout');
      expect(missing.status).toBe(403);
      expect(missing.body.code).toBe('CSRF_MISMATCH');

      const wrong = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', 'wrong-token');
      expect(wrong.status).toBe(403);
    });

    it('destroys the session when the CSRF token matches', async () => {
      await registerUser('ana@example.com');
      const agent = request.agent(app);
      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });
      const csrfToken = loginResponse.body.csrfToken as string;

      const logoutResponse = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrfToken);
      expect(logoutResponse.status).toBe(200);

      const meAfterLogout = await agent.get('/api/auth/me');
      expect(meAfterLogout.status).toBe(401);
    });
  });

  describe('POST /forgot-password', () => {
    it('always responds the same way for an unknown email', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(response.status).toBe(200);
      expect(mailer.sent).toHaveLength(0);
    });

    it('does not send a reset link to a deactivated account', async () => {
      await registerUser('ana@example.com');
      await deactivateUserByEmail(pool, 'ana@example.com');

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ana@example.com' });

      expect(response.status).toBe(200);
      expect(mailer.sent).toHaveLength(1); // only the original verification email
    });

    it('sends a reset link for an existing, active-or-pending account', async () => {
      await registerUser('ana@example.com');

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ana@example.com' });

      expect(response.status).toBe(200);
      const resetMail = mailer.sent.find((m) => m.subject.match(/reset/i));
      expect(resetMail).toBeDefined();
    });
  });

  describe('POST /reset-password', () => {
    it('rejects an unknown token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', password: OTHER_STRONG_PASSWORD });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TOKEN_INVALID');
    });

    it('rejects a weak new password', async () => {
      await registerUser('ana@example.com');
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ana@example.com' });
      const resetMail = mailer.sent.find((m) => m.subject.match(/reset/i))!;
      const token = extractTokenFromLink(resetMail.text);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'weak' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('changes the password and destroys every existing session for that user', async () => {
      await registerUser('ana@example.com');
      const verifyAgent = request.agent(app);
      await verifyAgent
        .post('/api/auth/verify-email')
        .send({ token: verifyLinkFor('ana@example.com') });

      // A second, independent "device" logged in with the old password.
      const otherDeviceAgent = request.agent(app);
      const loginResponse = await otherDeviceAgent
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });
      const userId = loginResponse.body.user.id as string;
      expect(await sessionCountForUserId(pool, userId)).toBeGreaterThan(0);

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ana@example.com' });
      const resetMail = mailer.sent.find((m) => m.subject.match(/reset/i))!;
      const token = extractTokenFromLink(resetMail.text);

      const resetResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: OTHER_STRONG_PASSWORD });
      expect(resetResponse.status).toBe(200);

      // Every session for the user is gone -- including the "other device"'s.
      expect(await sessionCountForUserId(pool, userId)).toBe(0);
      const otherDeviceMe = await otherDeviceAgent.get('/api/auth/me');
      expect(otherDeviceMe.status).toBe(401);

      // The old password no longer works; the new one does.
      const oldPasswordAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: STRONG_PASSWORD });
      expect(oldPasswordAttempt.status).toBe(401);

      const newPasswordAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: OTHER_STRONG_PASSWORD });
      expect(newPasswordAttempt.status).toBe(200);
    });

    it('cannot be replayed -- the token is single-use', async () => {
      await registerUser('ana@example.com');
      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ana@example.com' });
      const resetMail = mailer.sent.find((m) => m.subject.match(/reset/i))!;
      const token = extractTokenFromLink(resetMail.text);

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: OTHER_STRONG_PASSWORD });
      const secondAttempt = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'YetAnother3' });

      expect(secondAttempt.status).toBe(400);
      expect(secondAttempt.body.code).toBe('TOKEN_ALREADY_USED');
    });
  });
});
