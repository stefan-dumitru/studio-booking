export type SlotStatus = 'free' | 'booked' | 'mine';
export type UnbookableReason = 'past' | 'too_soon' | 'beyond_horizon';

export interface AvailabilitySlot {
  readonly start: string;
  readonly status: SlotStatus;
  readonly bookable: boolean;
  readonly reason?: UnbookableReason;
}

export interface AvailabilityResource {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly capacity: number;
  readonly slots: readonly AvailabilitySlot[];
}

export interface AvailabilityResult {
  readonly resources: readonly AvailabilityResource[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ResourceType {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
}
