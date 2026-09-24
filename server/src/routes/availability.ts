import { Router } from 'express';
import type { AvailabilityDeps } from '../services/availability.js';
import * as availabilityService from '../services/availability.js';
import { validateAvailabilityQuery } from '../validation/availability.js';
import { parsePageParams } from './pagination.js';

const DEFAULT_PAGE_SIZE = 25; // ui-guidelines.md > breakpoints: 25 resources per page.

/** Mounted at /api/availability, behind requireVerified. */
export function createAvailabilityRouter(deps: AvailabilityDeps): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    void (async () => {
      const { date, typeIds, from, to } = validateAvailabilityQuery(req.query);
      const { page, pageSize } = parsePageParams(req.query, DEFAULT_PAGE_SIZE);

      const result = await availabilityService.getAvailability(deps, {
        date,
        typeIds,
        from,
        to,
        page,
        pageSize,
        requestingMemberId: req.currentUser!.id,
      });

      res.status(200).json(result);
    })().catch(next);
  });

  return router;
}
