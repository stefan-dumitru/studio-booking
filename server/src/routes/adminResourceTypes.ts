import { Router } from 'express';
import type { ResourceTypeDeps } from '../services/resourceTypes.js';
import * as resourceTypeService from '../services/resourceTypes.js';
import { validateResourceTypeBody } from '../validation/resources.js';
import { parsePageParams } from './pagination.js';

/**
 * Mounted at /api/admin/resource-types, itself behind requireAdmin applied
 * once where /api/admin is mounted (server/src/app.ts) -- not repeated here,
 * per security.md > Authorization ("mounted behind requireAdmin in one
 * place, so admin routes are default-deny by construction").
 */
export function createAdminResourceTypesRouter(deps: ResourceTypeDeps): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    void (async () => {
      const { page, pageSize } = parsePageParams(req.query);
      const includeArchived = req.query['includeArchived'] === 'true';
      const result = await resourceTypeService.listResourceTypesForAdmin(deps, {
        includeArchived,
        page,
        pageSize,
      });
      res.status(200).json(result);
    })().catch(next);
  });

  router.post('/', (req, res, next) => {
    void (async () => {
      const input = validateResourceTypeBody(req.body);
      const created = await resourceTypeService.createResourceType(deps, {
        ...input,
        actorId: req.currentUser!.id,
      });
      res.status(201).json({ resourceType: created });
    })().catch(next);
  });

  router.patch('/:id', (req, res, next) => {
    void (async () => {
      const input = validateResourceTypeBody(req.body);
      const updated = await resourceTypeService.updateResourceType(
        deps,
        req.params.id!,
        {
          ...input,
          actorId: req.currentUser!.id,
        },
      );
      res.status(200).json({ resourceType: updated });
    })().catch(next);
  });

  router.post('/:id/archive', (req, res, next) => {
    void (async () => {
      await resourceTypeService.archiveResourceType(
        deps,
        req.params.id!,
        req.currentUser!.id,
      );
      res.status(200).json({ message: 'Resource type archived.' });
    })().catch(next);
  });

  router.post('/:id/unarchive', (req, res, next) => {
    void (async () => {
      await resourceTypeService.unarchiveResourceType(
        deps,
        req.params.id!,
        req.currentUser!.id,
      );
      res.status(200).json({ message: 'Resource type unarchived.' });
    })().catch(next);
  });

  return router;
}
