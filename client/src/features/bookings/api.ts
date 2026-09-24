import { apiFetch } from '../../lib/apiClient.js';
import type { Booking } from './types.js';

export interface CreateBookingInput {
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export function createBooking(
  input: CreateBookingInput,
  csrfToken: string,
): Promise<{ booking: Booking }> {
  return apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
    csrfToken,
  });
}
