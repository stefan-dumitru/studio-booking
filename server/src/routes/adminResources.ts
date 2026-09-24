import { Router } from 'express';
import type { ResourceDeps } from '../services/resources.js';
import * as resourceService from '../services/resources.js';
import {
  validateCreateResourceBody,
  validateUpdateResourceBody,
} from '../validation/resources.js';
import { parsePageParams, parseStringParam } from './pagination.js';
import type { ResourceStatusFilter } from '../db/queries/resources.js';

function parseStatusFilter(raw: string): ResourceStatusFilter {
  if (raw === 'archived' || raw === 'all') return raw;
  return 'active'; // the sensible default for a browse-style admin list
}

/**
 * Mounted at /api/admin/resources, behind requireAdmin applied once where
 * /api/admin is mounted (server/src/app.ts) -- see adminResourceTypes.ts's
 * doc comment for the same note.
 */
export function createAdminResourcesRouter(deps: ResourceDeps): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    void (async () => {
      const { page, pageSize } = parsePageParams(req.query);
      const q = parseStringParam(req.query, 'q');
      const typeIdRaw = parseStringParam(req.query, 'typeId');
      const status = parseStatusFilter(parseStringParam(req.query, 'status'));

      const result = await resourceService.listResourcesForAdmin(deps, {
        q,
        typeId: typeIdRaw || null,
        status,
        page,
        pageSize,
      });
      res.status(200).json(result);
    })().catch(next);
  });

  router.post('/', (req, res, next) => {
    void (async () => {
      const input = validateCreateResourceBody(req.body);
      const created = await resourceService.createResource(deps, {
        ...input,
        actorId: req.currentUser!.id,
      });
      res.status(201).json({ resource: created });
    })().catch(next);
  });

  router.patch('/:id', (req, res, next) => {
    void (async () => {
      const input = validateUpdateResourceBody(req.body);
      const updated = await resourceService.updateResource(deps, req.params.id!, {
        ...input,
        actorId: req.currentUser!.id,
      });
      res.status(200).json({ resource: updated });
    })().catch(next);
  });

  router.post('/:id/archive', (req, res, next) => {
    void (async () => {
      await resourceService.archiveResource(
        deps,
        req.params.id!,
        req.currentUser!.id,
      );
      res.status(200).json({ message: 'Resource archived.' });
    })().catch(next);
  });

  router.post('/:id/unarchive', (req, res, next) => {
    void (async () => {
      await resourceService.unarchiveResource(
        deps,
        req.params.id!,
        req.currentUser!.id,
      );
      res.status(200).json({ message: 'Resource unarchived.' });
    })().catch(next);
  });

  return router;
}
