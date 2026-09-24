import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { extractTokenFromLink } from './dbHelpers.js';
import type { FakeMailer } from './fakeMailer.js';

export interface MemberSession {
  readonly agent: ReturnType<typeof request.agent>;
  readonly csrfToken: string;
  readonly userId: string;
  readonly email: string;
}

/**
 * Registers and verifies a plain member (no promotion) -- the setup every
 * availability/booking test needs. Mirrors adminAgent.ts's loginAsAdmin.
 */
export async function loginAsMember(
  app: Express,
  _pool: Pool,
  mailer: FakeMailer,
  email: string,
  displayName = 'Member',
): Promise<MemberSession> {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/register')
    .send({ email, displayName, password: 'Correcthorse1' });
  const token = extractTokenFromLink(mailer.sent.find((m) => m.to === email)!.text);
  const verifyResponse = await agent.post('/api/auth/verify-email').send({ token });

  return {
    agent,
    csrfToken: verifyResponse.body.csrfToken as string,
    userId: verifyResponse.body.user.id as string,
    email,
  };
}
