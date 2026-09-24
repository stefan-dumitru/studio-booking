import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { findUserById } from '../db/queries/users.js';
import { requireCsrf } from './csrf.js';

/**
 * Composable auth guards, applied at the router level so a new route can't
 * silently ship unguarded (specifications/security.md > Authorization).
 *
 * requireVerified and requireAdmin are arrays that include requireAuth, so
 * mounting `...requireAdmin` gets the full chain in one spread without a
 * second database fetch at each layer -- the user is loaded once and carried
 * on req.currentUser. Both also end with requireCsrf (a no-op on GET/HEAD/
 * OPTIONS -- see csrf.ts), so every route that reaches this far automatically
 * gets CSRF protection on its mutating methods without each one remembering
 * to add it. requireAuth alone (used bare only by GET /me and, with an
 * explicit extra requireCsrf, POST /logout) does not include it, since a
 * pending member must be able to log out without being verified first.
 */
export interface AuthMiddleware {
  readonly requireAuth: RequestHandler;
  readonly requireVerified: readonly RequestHandler[];
  readonly requireAdmin: readonly RequestHandler[];
}

export function createAuthMiddleware(pool: Pool): AuthMiddleware {
  const requireAuth: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    void (async () => {
      const userId = req.session.userId;
      if (!userId) {
        res
          .status(401)
          .json({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
        return;
      }

      // Re-read from the database on every request rather than trusting what
      // was true at login, so a deactivation takes effect immediately
      // (specifications/security.md > Authentication: "fails closed").
      const user = await findUserById(pool, userId);
      if (!user || user.status === 'deactivated') {
        req.session.destroy(() => {
          res
            .status(401)
            .json({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
        });
        return;
      }

      req.currentUser = user;
      next();
    })().catch(next);
  };

  const requireVerifiedOnly: RequestHandler = (req, res, next) => {
    if (req.currentUser?.status !== 'active') {
      res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email to continue.',
      });
      return;
    }
    next();
  };

  const requireAdminOnly: RequestHandler = (req, res, next) => {
    if (req.currentUser?.role !== 'admin') {
      res
        .status(403)
        .json({ code: 'FORBIDDEN', message: "You don't have access to this." });
      return;
    }
    next();
  };

  return {
    requireAuth,
    requireVerified: [requireAuth, requireVerifiedOnly, requireCsrf],
    requireAdmin: [requireAuth, requireVerifiedOnly, requireAdminOnly, requireCsrf],
  };
}
