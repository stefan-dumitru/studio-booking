export interface Booking {
  readonly id: string;
  readonly resourceId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: 'booked' | 'cancelled';
}
