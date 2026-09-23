import expressSession from 'express-session';
import connectPgSimpleFactory from 'connect-pg-simple';
import type { Pool } from 'pg';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';

/**
 * Server-side sessions in Postgres, chosen specifically so deactivating a
 * member locks them out immediately -- a stateless JWT can't do that without
 * reintroducing server state as a denylist (specifications/security.md >
 * Authentication).
 *
 * The connect-pg-simple store reuses the `session` table created by migration
 * 010_session.sql. createTableIfMissing stays false: the schema lives in
 * migration history, not in library-owned DDL run on boot.
 */
export function createSessionMiddleware(
  pool: Pool,
  config: Config,
): RequestHandler {
  const PgSession = connectPgSimpleFactory(expressSession);

  const store = new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  });

  return expressSession({
    store,
    secret: config.sessionSecret,
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/',
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    },
  });
}
