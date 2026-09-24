import { Router } from 'express';
import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { createAdminResourceTypesRouter } from './adminResourceTypes.js';
import { createAdminResourcesRouter } from './adminResources.js';
import { createAdminBookingsRouter } from './adminBookings.js';
import { createAdminMembersRouter } from './adminMembers.js';
import * as memberService from '../services/members.js';

export interface AdminDeps {
  readonly pool: Pool;
  readonly config: Config;
}

/**
 * Composes every /api/admin sub-router. Mounted once behind requireAdmin in
 * app.ts, not here -- see adminResourceTypes.ts's doc comment.
 */
export function createAdminRouter(deps: AdminDeps): Router {
  const router = Router();
  router.use('/resource-types', createAdminResourceTypesRouter(deps));
  router.use('/resources', createAdminResourcesRouter(deps));
  router.use('/bookings', createAdminBookingsRouter(deps));
  router.use('/members', createAdminMembersRouter(deps));

  // functional.md > User Roles: the admin landing view -- three counts, no
  // sub-resource of its own, so it lives here rather than in its own router.
  router.get('/summary', (req, res, next) => {
    void (async () => {
      const summary = await memberService.getAdminSummary(deps);
      res.status(200).json(summary);
    })().catch(next);
  });

  return router;
}
