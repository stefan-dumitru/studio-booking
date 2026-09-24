import express from 'express';
import type { Express } from 'express';
import type { Pool } from 'pg';
import type { Config } from './config.js';
import type { Mailer } from './mail/mailer.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import { createResourceTypesRouter } from './routes/resourceTypes.js';
import { createAvailabilityRouter } from './routes/availability.js';
import { createBookingsRouter } from './routes/bookings.js';
import { createSessionMiddleware } from './middleware/session.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export interface AppDependencies {
  readonly pool: Pool;
  readonly config: Config;
  readonly mailer: Mailer;
}

/**
 * Builds the Express app around its dependencies rather than importing a
 * module-level singleton.
 *
 * This is what makes the database-down case testable: a test can hand in a pool
 * pointed at a closed port and assert a 503. With a singleton there would be no
 * way to reach that branch without breaking the real database. The same
 * pattern is why register/login tests can hand in a fake mailer instead of
 * needing a real SMTP server.
 */
export function createApp({ pool, config, mailer }: AppDependencies): Express {
  const app = express();

  // Express 5 sends its own X-Powered-By otherwise, which tells an attacker the
  // stack for free.
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(createSessionMiddleware(pool, config));

  const auth = createAuthMiddleware(pool);

  app.use('/api', createHealthRouter(pool));
  app.use('/api/auth', createAuthRouter({ pool, config, mailer }, auth));
  // The entire admin surface sits behind requireAdmin in one place, so a new
  // admin route can't ship unguarded (security.md > Authorization).
  app.use('/api/admin', ...auth.requireAdmin, createAdminRouter({ pool, config }));
  app.use('/api/resource-types', ...auth.requireVerified, createResourceTypesRouter(pool));
  app.use('/api/availability', ...auth.requireVerified, createAvailabilityRouter({ pool, config }));
  app.use('/api/bookings', ...auth.requireVerified, createBookingsRouter({ pool, config }));

  // Must be last: it only catches errors from routes registered before it.
  app.use(errorHandler);

  return app;
}
