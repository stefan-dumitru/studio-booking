import { Router } from 'express';
import type { MemberDeps } from '../services/members.js';
import * as memberService from '../services/members.js';
import type { AdminMemberStatusFilter } from '../db/queries/users.js';
import { parsePageParams, parseStringParam } from './pagination.js';

function parseStatusFilter(raw: string): AdminMemberStatusFilter {
  if (raw === 'active' || raw === 'pending_verification' || raw === 'deactivated') {
    return raw;
  }
  return 'all';
}

/**
 * Mounted at /api/admin/members, itself behind requireAdmin applied once
 * where /api/admin is mounted (server/src/app.ts) -- see
 * adminResourceTypes.ts's doc comment for the same note.
 */
export function createAdminMembersRouter(deps: MemberDeps): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    void (async () => {
      const { page, pageSize } = parsePageParams(req.query);
      const q = parseStringParam(req.query, 'q');
      const status = parseStatusFilter(parseStringParam(req.query, 'status'));

      const result = await memberService.listMembers(deps, { q, status, page, pageSize });
      res.status(200).json(result);
    })().catch(next);
  });

  router.post('/:id/deactivate', (req, res, next) => {
    void (async () => {
      await memberService.deactivateMember(deps, {
        targetId: req.params.id!,
        actorId: req.currentUser!.id,
      });
      res.status(200).json({ message: 'Member deactivated.' });
    })().catch(next);
  });

  router.post('/:id/reactivate', (req, res, next) => {
    void (async () => {
      await memberService.reactivateMember(deps, {
        targetId: req.params.id!,
        actorId: req.currentUser!.id,
      });
      res.status(200).json({ message: 'Member reactivated.' });
    })().catch(next);
  });

  router.post('/:id/promote', (req, res, next) => {
    void (async () => {
      await memberService.changeMemberRole(deps, {
        targetId: req.params.id!,
        actorId: req.currentUser!.id,
        newRole: 'admin',
      });
      res.status(200).json({ message: 'Member promoted to admin.' });
    })().catch(next);
  });

  router.post('/:id/demote', (req, res, next) => {
    void (async () => {
      await memberService.changeMemberRole(deps, {
        targetId: req.params.id!,
        actorId: req.currentUser!.id,
        newRole: 'member',
      });
      res.status(200).json({ message: 'Member demoted.' });
    })().catch(next);
  });

  return router;
}
