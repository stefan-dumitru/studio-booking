import { Router } from 'express';
import type { BookingDeps } from '../services/bookings.js';
import * as bookingService from '../services/bookings.js';
import { validateCreateBookingBody } from '../validation/bookings.js';

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

  return router;
}
