import { Router } from 'express';
import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { createAdminResourceTypesRouter } from './adminResourceTypes.js';
import { createAdminResourcesRouter } from './adminResources.js';

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
  return router;
}
