import type { Queryable } from '../types.js';

/**
 * connect-pg-simple's session table has no user_id column -- it stores
 * whatever express-session puts in req.session as an opaque JSON blob. To
 * find "every session belonging to this user" (required by password reset
 * and, later, member deactivation), this reaches into that blob for the
 * `userId` key the session middleware sets (server/src/middleware/session.ts).
 *
 * A JSON-path query with no index is fine at this app's scale (a few hundred
 * concurrent sessions at most, per performance.md); it is not on any hot path.
 */
export async function destroySessionsForUser(
  db: Queryable,
  userId: string,
): Promise<void> {
  await db.query(`DELETE FROM session WHERE (sess::jsonb ->> 'userId') = $1`, [
    userId,
  ]);
}
