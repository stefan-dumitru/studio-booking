import type { UserRow } from '../db/types.js';

/**
 * requireAuth loads the user fresh from the database on every request and
 * attaches it here, so requireVerified/requireAdmin and the route handler
 * itself don't each re-query it.
 */
declare global {
  namespace Express {
    interface Request {
      currentUser?: UserRow;
    }
  }
}

export {};
