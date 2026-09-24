export interface ResourceDto {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly archivedAt: string | null;
}

export interface ConflictingBookingDto {
  readonly bookingId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly memberDisplayName: string;
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type ResourceStatusFilter = 'active' | 'archived' | 'all';
