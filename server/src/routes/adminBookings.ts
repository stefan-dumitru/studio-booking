import { Router } from 'express';
import type { BookingDeps } from '../services/bookings.js';
import * as bookingService from '../services/bookings.js';
import type { AdminBookingStatusFilter } from '../db/queries/bookings.js';
import { parsePageParams, parseStringParam } from './pagination.js';

function parseStatusFilter(raw: string): AdminBookingStatusFilter {
  if (raw === 'booked' || raw === 'cancelled') return raw;
  return 'all';
}

/**
 * Mounted at /api/admin/bookings, itself behind requireAdmin applied once
 * where /api/admin is mounted (server/src/app.ts) -- see
 * adminResourceTypes.ts's doc comment for the same note.
 */
export function createAdminBookingsRouter(deps: BookingDeps): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    void (async () => {
      const { page, pageSize } = parsePageParams(req.query);
      const q = parseStringParam(req.query, 'q');
      const resourceId = parseStringParam(req.query, 'resourceId');
      const dateFrom = parseStringParam(req.query, 'dateFrom');
      const dateTo = parseStringParam(req.query, 'dateTo');
      const status = parseStatusFilter(parseStringParam(req.query, 'status'));

      const result = await bookingService.listAllBookings(deps, {
        q,
        resourceId: resourceId || null,
        status,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        page,
        pageSize,
      });
      res.status(200).json(result);
    })().catch(next);
  });

  router.delete('/:id', (req, res, next) => {
    void (async () => {
      const booking = await bookingService.cancelBookingAsAdmin(deps, {
        bookingId: req.params.id!,
        actorId: req.currentUser!.id,
      });
      res.status(200).json({ booking });
    })().catch(next);
  });

  return router;
}
