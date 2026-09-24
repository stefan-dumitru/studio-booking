import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { promoteToAdminByEmail, extractTokenFromLink } from './dbHelpers.js';
import type { FakeMailer } from './fakeMailer.js';

export interface AdminSession {
  readonly agent: ReturnType<typeof request.agent>;
  readonly csrfToken: string;
  readonly userId: string;
}

/**
 * Registers, verifies, promotes to admin, and returns an authenticated agent
 * with its CSRF token -- the setup every admin-route test needs, extracted
 * once resource-type and resource tests both needed it.
 */
export async function loginAsAdmin(
  app: Express,
  pool: Pool,
  mailer: FakeMailer,
  email = 'admin@example.com',
): Promise<AdminSession> {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/register')
    .send({ email, displayName: 'Admin', password: 'Correcthorse1' });
  const token = extractTokenFromLink(mailer.sent.find((m) => m.to === email)!.text);
  const verifyResponse = await agent.post('/api/auth/verify-email').send({ token });

  await promoteToAdminByEmail(pool, email);

  // Promotion happened after the session was already established, and
  // requireAuth re-reads the user on every request -- so the *next* request
  // already sees role='admin' without needing a fresh login.
  const csrfToken = verifyResponse.body.csrfToken as string;
  const userId = verifyResponse.body.user.id as string;

  return { agent, csrfToken, userId };
}
