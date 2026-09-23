import 'express-session';

/**
 * What this app stores in the session, beyond express-session's own cookie
 * bookkeeping. userId is the only thing the auth guards trust; csrfToken is
 * the synchronizer token issued at login (see server/src/middleware/csrf.ts).
 */
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}
