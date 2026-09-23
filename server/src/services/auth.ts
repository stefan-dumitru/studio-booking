import bcrypt from 'bcrypt';
import type { Pool } from 'pg';
import type { Request } from 'express';
import type { Config } from '../config.js';
import type { Mailer } from '../mail/mailer.js';
import { verifyEmailTemplate } from '../mail/templates/verifyEmail.js';
import { resetPasswordTemplate } from '../mail/templates/resetPassword.js';
import { AppError } from '../errors.js';
import { withTransaction } from '../db/withTransaction.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { generateRawToken, hashToken } from './tokenUtil.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import {
  regenerateSession,
  saveSession,
  destroySession,
} from '../middleware/sessionUtil.js';
import {
  findUserByEmail,
  insertPendingUser,
  markEmailVerified,
  updatePasswordHash,
} from '../db/queries/users.js';
import {
  findTokenByHash,
  insertEmailToken,
  invalidateAllTokensForUser,
  invalidateTokensByPurpose,
} from '../db/queries/emailTokens.js';
import { destroySessionsForUser } from '../db/queries/sessions.js';
import { recordAuditEvent } from '../db/queries/auditLog.js';
import { toPublicUser } from '../db/types.js';
import type { EmailTokenRow, PublicUser } from '../db/types.js';

export interface AuthDeps {
  readonly pool: Pool;
  readonly mailer: Mailer;
  readonly config: Config;
}

export interface SessionResult {
  readonly user: PublicUser;
  readonly csrfToken: string;
}

const GENERIC_LOGIN_FAILURE =
  "Email or password is incorrect, or the account isn't active.";

function invalidCredentials(): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_FAILURE);
}

/**
 * Regenerates the session id (closes session fixation), stores the user id,
 * and issues a fresh CSRF token -- the one place a session is actually
 * created, used by both login and the verify-email auto-login.
 */
async function establishSession(req: Request, userId: string): Promise<string> {
  await regenerateSession(req);
  req.session.userId = userId;
  const csrfToken = issueCsrfToken();
  req.session.csrfToken = csrfToken;
  await saveSession(req);
  return csrfToken;
}

function checkTokenValidity(
  tokenRow: EmailTokenRow | null,
  invalidMessage: string,
): asserts tokenRow is EmailTokenRow {
  if (!tokenRow) throw new AppError(400, 'TOKEN_INVALID', invalidMessage);
  if (tokenRow.usedAt) {
    throw new AppError(
      400,
      'TOKEN_ALREADY_USED',
      'This link has already been used.',
    );
  }
  if (tokenRow.expiresAt.getTime() < Date.now()) {
    throw new AppError(
      400,
      'TOKEN_EXPIRED',
      'This link has expired. Request a new one.',
    );
  }
}

export interface RegisterInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

/**
 * Creates the account and sends the verification email in one transaction --
 * if the send throws, the whole thing rolls back, so a failed email never
 * leaves an unverifiable account squatting on the address
 * (specifications/operations.md > External Integrations).
 */
export async function register(
  deps: AuthDeps,
  input: RegisterInput,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const passwordHash = await bcrypt.hash(input.password, deps.config.bcryptCost);

    let user;
    try {
      user = await insertPendingUser(client, {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'That email is already registered.',
        );
      }
      throw error;
    }

    const rawToken = generateRawToken();
    const expiresAt = new Date(
      Date.now() + deps.config.verifyTokenTtlHours * 60 * 60 * 1000,
    );
    await insertEmailToken(client, {
      userId: user.id,
      purpose: 'verify_email',
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    const link = `${deps.config.appBaseUrl}/verify-email?token=${rawToken}`;
    // Inside the transaction on purpose -- see the doc comment above.
    await deps.mailer.send(
      verifyEmailTemplate(user.email, link, deps.config.verifyTokenTtlHours),
    );
  });
}

/**
 * Always resolves the same way regardless of whether the account exists,
 * is already verified, or is deactivated -- no-oracle, matching
 * forgotPassword below (specifications/security.md > Authentication).
 */
export async function resendVerification(
  deps: AuthDeps,
  email: string,
): Promise<void> {
  const user = await findUserByEmail(deps.pool, email);
  if (!user || user.status !== 'pending_verification') return;

  await withTransaction(deps.pool, async (client) => {
    await invalidateTokensByPurpose(client, user.id, 'verify_email');
    const rawToken = generateRawToken();
    const expiresAt = new Date(
      Date.now() + deps.config.verifyTokenTtlHours * 60 * 60 * 1000,
    );
    await insertEmailToken(client, {
      userId: user.id,
      purpose: 'verify_email',
      tokenHash: hashToken(rawToken),
      expiresAt,
    });
    const link = `${deps.config.appBaseUrl}/verify-email?token=${rawToken}`;
    await deps.mailer.send(
      verifyEmailTemplate(user.email, link, deps.config.verifyTokenTtlHours),
    );
  });
}

/**
 * The one auto-login case in this app: verifying opens the app already
 * logged in (ui-guidelines.md > Key Flows), so the member lands on Browse
 * instead of a bare confirmation page.
 */
export async function verifyEmail(
  deps: AuthDeps,
  req: Request,
  rawToken: string,
): Promise<SessionResult> {
  const tokenHash = hashToken(rawToken);

  const user = await withTransaction(deps.pool, async (client) => {
    const tokenRow = await findTokenByHash(client, 'verify_email', tokenHash);
    checkTokenValidity(tokenRow, 'This verification link is invalid.');

    const verifiedUser = await markEmailVerified(client, tokenRow.userId);
    await invalidateTokensByPurpose(client, verifiedUser.id, 'verify_email');
    await recordAuditEvent(client, {
      action: 'email.verified',
      actorId: verifiedUser.id,
      targetType: 'user',
      targetId: verifiedUser.id,
    });
    return verifiedUser;
  });

  // Session establishment is outside the SQL transaction (connect-pg-simple
  // manages the session table through its own connection); if it fails here
  // the account is still correctly verified and the member can just log in
  // normally -- not a correctness problem worth compensating for.
  const csrfToken = await establishSession(req, user.id);
  return { user: toPublicUser(user), csrfToken };
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Succeeds for a pending_verification account too (creates a session) --
 * requireVerified gates business routes afterward and the client redirects to
 * a "please verify" screen. Fails identically (generic message) for unknown
 * email, wrong password, or a deactivated account. See the Phase 1 plan for
 * why this resolves an earlier contradiction in security.md.
 */
export async function login(
  deps: AuthDeps,
  req: Request,
  input: LoginInput,
): Promise<SessionResult> {
  const user = await findUserByEmail(deps.pool, input.email);
  const ip = req.ip ?? null;

  if (!user) {
    await recordAuditEvent(deps.pool, {
      action: 'login.failure',
      actorEmailAttempted: input.email,
      ip,
    });
    throw invalidCredentials();
  }

  if (user.status === 'deactivated') {
    await recordAuditEvent(deps.pool, {
      action: 'login.failure',
      actorId: user.id,
      actorEmailAttempted: input.email,
      ip,
    });
    throw invalidCredentials();
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    await recordAuditEvent(deps.pool, {
      action: 'login.failure',
      actorId: user.id,
      actorEmailAttempted: input.email,
      ip,
    });
    throw invalidCredentials();
  }

  const csrfToken = await establishSession(req, user.id);
  await recordAuditEvent(deps.pool, {
    action: 'login.success',
    actorId: user.id,
    ip,
  });

  return { user: toPublicUser(user), csrfToken };
}

/** Idempotent: a no-op if there is no session to log out of. */
export async function logout(deps: AuthDeps, req: Request): Promise<void> {
  const userId = req.session.userId;
  if (!userId) return;

  await recordAuditEvent(deps.pool, { action: 'logout', actorId: userId });
  await destroySession(req);
}

/**
 * Always resolves the same way regardless of whether the account exists or
 * is deactivated -- the response can't be used to enumerate members
 * (specifications/security.md > Authentication).
 */
export async function forgotPassword(deps: AuthDeps, email: string): Promise<void> {
  const user = await findUserByEmail(deps.pool, email);
  if (!user || user.status === 'deactivated') return;

  await withTransaction(deps.pool, async (client) => {
    await invalidateTokensByPurpose(client, user.id, 'reset_password');
    const rawToken = generateRawToken();
    const expiresAt = new Date(
      Date.now() + deps.config.resetTokenTtlHours * 60 * 60 * 1000,
    );
    await insertEmailToken(client, {
      userId: user.id,
      purpose: 'reset_password',
      tokenHash: hashToken(rawToken),
      expiresAt,
    });
    await recordAuditEvent(client, {
      action: 'password.reset_requested',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
    });
    const link = `${deps.config.appBaseUrl}/reset-password?token=${rawToken}`;
    await deps.mailer.send(
      resetPasswordTemplate(user.email, link, deps.config.resetTokenTtlHours),
    );
  });
}

export interface ResetPasswordInput {
  readonly token: string;
  readonly password: string;
}

/**
 * Invalidates every outstanding token (both purposes) and destroys every
 * session for the user -- security.md's literal wording. Deliberately does
 * NOT auto-login: the member logs in fresh with the new password, which also
 * confirms it actually works.
 */
export async function resetPassword(
  deps: AuthDeps,
  input: ResetPasswordInput,
): Promise<void> {
  const tokenHash = hashToken(input.token);

  await withTransaction(deps.pool, async (client) => {
    const tokenRow = await findTokenByHash(client, 'reset_password', tokenHash);
    checkTokenValidity(tokenRow, 'This reset link is invalid.');

    const passwordHash = await bcrypt.hash(input.password, deps.config.bcryptCost);
    await updatePasswordHash(client, tokenRow.userId, passwordHash);
    // Marks this token (and any sibling of either purpose) used in one call.
    await invalidateAllTokensForUser(client, tokenRow.userId);
    await destroySessionsForUser(client, tokenRow.userId);
    await recordAuditEvent(client, {
      action: 'password.reset_completed',
      actorId: tokenRow.userId,
      targetType: 'user',
      targetId: tokenRow.userId,
    });
  });
}
