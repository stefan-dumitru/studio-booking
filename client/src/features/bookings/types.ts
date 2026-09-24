export interface Booking {
  readonly id: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: 'booked' | 'cancelled';
}

export interface MyBooking extends Booking {
  readonly resourceName: string;
}

export type BookingScope = 'upcoming' | 'past';

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
