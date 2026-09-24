import { MAX_BOOKING_MINUTES, SLOT_MINUTES } from '@studio/shared';
import { ValidationErrors, readString } from './shared.js';

export interface CreateBookingBody {
  readonly resourceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

function isAlignedToSlotBoundary(date: Date): boolean {
  return date.getUTCMinutes() % SLOT_MINUTES === 0 && date.getUTCSeconds() === 0;
}

/**
 * Shape-level checks only -- everything that depends on the resource, on
 * "now", or on the member's existing bookings is a business rule checked in
 * the transaction (services/bookings.ts), not here.
 */
export function validateCreateBookingBody(body: unknown): CreateBookingBody {
  const errors = new ValidationErrors();

  const resourceId = readString(body, 'resourceId').trim();
  if (!resourceId) errors.add('resourceId', 'is required');

  const startsAtRaw = readString(body, 'startsAt');
  const endsAtRaw = readString(body, 'endsAt');
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);

  if (!startsAtRaw || Number.isNaN(startsAt.getTime())) {
    errors.add('startsAt', 'must be a valid ISO-8601 timestamp');
  } else if (!isAlignedToSlotBoundary(startsAt)) {
    errors.add('startsAt', `must align to a ${SLOT_MINUTES}-minute slot boundary`);
  }

  if (!endsAtRaw || Number.isNaN(endsAt.getTime())) {
    errors.add('endsAt', 'must be a valid ISO-8601 timestamp');
  } else if (!isAlignedToSlotBoundary(endsAt)) {
    errors.add('endsAt', `must align to a ${SLOT_MINUTES}-minute slot boundary`);
  }

  if (!errors.hasAny) {
    const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
    if (durationMinutes <= 0) {
      errors.add('endsAt', 'must be after startsAt');
    } else if (durationMinutes % SLOT_MINUTES !== 0) {
      errors.add(
        'endsAt',
        `must be a whole number of ${SLOT_MINUTES}-minute slots after startsAt`,
      );
    } else if (durationMinutes > MAX_BOOKING_MINUTES) {
      errors.add(
        'endsAt',
        `must be at most ${MAX_BOOKING_MINUTES} minutes after startsAt`,
      );
    }
  }

  errors.throwIfAny();
  return { resourceId, startsAt, endsAt };
}
