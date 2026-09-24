import { Router } from 'express';
import type { BookingDeps } from '../services/bookings.js';
import type { BookingScope } from '../db/queries/bookings.js';
import * as bookingService from '../services/bookings.js';
import { validateCreateBookingBody } from '../validation/bookings.js';
import { parsePageParams, parseStringParam } from './pagination.js';

function parseScopeFilter(raw: string): BookingScope {
  return raw === 'past' ? 'past' : 'upcoming'; // the sensible default: what am I about to use?
}

/**
 * Mounted at /api/bookings, behind requireVerified (CSRF is folded into
 * that chain -- see middleware/auth.ts). Admins book for themselves through
 * this same route, using their own session's id -- there is no "book on
 * behalf of" field (functional.md > User Roles: explicitly out of scope).
 */
export function createBookingsRouter(deps: BookingDeps): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    void (async () => {
      const input = validateCreateBookingBody(req.body);
      const booking = await bookingService.createBooking(deps, {
        ...input,
        memberId: req.currentUser!.id,
      });
      res.status(201).json({ booking });
    })().catch(next);
  });

  router.get('/mine', (req, res, next) => {
    void (async () => {
      const scope = parseScopeFilter(parseStringParam(req.query, 'scope'));
      const { page, pageSize } = parsePageParams(req.query, 20);

      const result = await bookingService.listMyBookings(deps, {
        memberId: req.currentUser!.id,
        scope,
        page,
        pageSize,
      });
      res.status(200).json(result);
    })().catch(next);
  });

  router.delete('/:id', (req, res, next) => {
    void (async () => {
      const booking = await bookingService.cancelOwnBooking(deps, {
        bookingId: req.params.id!,
        memberId: req.currentUser!.id,
      });
      res.status(200).json({ booking });
    })().catch(next);
  });

  return router;
}
