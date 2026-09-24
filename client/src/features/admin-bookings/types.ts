export interface AdminBookingDto {
  readonly id: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: 'booked' | 'cancelled';
  readonly resourceName: string;
  readonly memberDisplayName: string;
  readonly memberEmail: string;
}

export type AdminBookingStatusFilter = 'booked' | 'cancelled' | 'all';

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
