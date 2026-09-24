import { Router } from 'express';
import type { Pool } from 'pg';
import { listResourceTypes } from '../db/queries/resourceTypes.js';
import { toResourceTypeDto } from '../db/types.js';

/**
 * Member-facing, mounted at /api/resource-types behind requireVerified (not
 * requireAdmin -- a member isn't an admin, and the browse filter needs this
 * list too). Active types only, unpaginated: a handful of rows at this
 * app's scale, and this exists purely to populate a filter dropdown.
 */
export function createResourceTypesRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    void (async () => {
      const { rows } = await listResourceTypes(pool, {
        includeArchived: false,
        limit: 100,
        offset: 0,
      });
      res.status(200).json({ resourceTypes: rows.map(toResourceTypeDto) });
    })().catch(next);
  });

  return router;
}
