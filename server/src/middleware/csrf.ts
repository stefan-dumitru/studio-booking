import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const CSRF_HEADER = 'x-csrf-token';

/**
 * Synchronizer-token-via-header CSRF protection: a random token is generated
 * at login (issueCsrfToken), stored server-side in the session, and returned
 * once in the JSON response body for the client to hold in memory and echo
 * back via the X-CSRF-Token header on every mutating request.
 *
 * This is a deliberate variant of the "double-submit cookie" pattern named in
 * security.md -- see the Phase 1 plan for the reasoning. The guarantee is the
 * same: a cross-site request can't read the JSON response or set a custom
 * header, so it can't produce a matching token.
 */
export function issueCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/** Applied after requireAuth on every mutating (non-GET) authenticated route. */
export const requireCsrf: RequestHandler = (req, res, next) => {
  const expected = req.session.csrfToken;
  const provided = req.get(CSRF_HEADER);

  if (!expected || !provided || !constantTimeEquals(expected, provided)) {
    res
      .status(403)
      .json({ code: 'CSRF_MISMATCH', message: "You don't have access to this." });
    return;
  }
  next();
};

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on mismatched lengths rather than returning false.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
