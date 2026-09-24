import { apiFetch } from '../../lib/apiClient.js';
import type { AdminBookingDto, AdminBookingStatusFilter, PagedResult } from './types.js';

export interface ListBookingsParams {
  readonly q: string;
  readonly resourceId: string | null;
  readonly status: AdminBookingStatusFilter;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly page: number;
}

export function listBookings(
  params: ListBookingsParams,
): Promise<PagedResult<AdminBookingDto>> {
  const search = new URLSearchParams({
    status: params.status,
    page: String(params.page),
    pageSize: '50',
  });
  if (params.q) search.set('q', params.q);
  if (params.resourceId) search.set('resourceId', params.resourceId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);

  return apiFetch(`/admin/bookings?${search.toString()}`, { method: 'GET' });
}

export function cancelBooking(
  id: string,
  csrfToken: string,
): Promise<{ booking: AdminBookingDto }> {
  return apiFetch(`/admin/bookings/${id}`, { method: 'DELETE', csrfToken });
}
