import { apiFetch } from '../../lib/apiClient.js';
import type { Booking, BookingScope, MyBooking, PagedResult } from './types.js';

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

export interface ListMyBookingsParams {
  readonly scope: BookingScope;
  readonly page: number;
}

export function listMyBookings(
  params: ListMyBookingsParams,
): Promise<PagedResult<MyBooking>> {
  const search = new URLSearchParams({
    scope: params.scope,
    page: String(params.page),
  });
  return apiFetch(`/bookings/mine?${search.toString()}`, { method: 'GET' });
}

export function cancelBooking(
  id: string,
  csrfToken: string,
): Promise<{ booking: Booking }> {
  return apiFetch(`/bookings/${id}`, { method: 'DELETE', csrfToken });
}
