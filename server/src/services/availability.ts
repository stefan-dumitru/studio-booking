import type { Pool } from 'pg';
import {
  BOOKING_HORIZON_DAYS,
  MIN_NOTICE_MINUTES,
  SLOT_MINUTES,
} from '@studio/shared';
import type { Config } from '../config.js';
import {
  listBookedSlotsForResources,
  listResourcesWithWindows,
} from '../db/queries/availability.js';

export interface AvailabilityDeps {
  readonly pool: Pool;
  readonly config: Config;
}

export type SlotStatus = 'free' | 'booked' | 'mine';
export type UnbookableReason = 'past' | 'too_soon' | 'beyond_horizon';

export interface AvailabilitySlotDto {
  readonly start: string; // ISO instant
  readonly status: SlotStatus;
  readonly bookable: boolean;
  readonly reason?: UnbookableReason;
}

export interface AvailabilityResourceDto {
  readonly id: string;
  readonly name: string;
  readonly typeId: string;
  readonly capacity: number;
  readonly slots: readonly AvailabilitySlotDto[];
}

export interface GetAvailabilityInput {
  readonly date: string;
  readonly typeIds: readonly string[] | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
  readonly pageSize: number;
  readonly requestingMemberId: string;
}

export interface GetAvailabilityOutput {
  readonly resources: readonly AvailabilityResourceDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const SLOT_MS = SLOT_MINUTES * 60 * 1000;

/**
 * Generates every 30-minute slot in [windowStart, windowEnd) as plain UTC
 * instant walking -- all the DST-sensitive work already happened in SQL
 * (listResourcesWithWindows), so this is just repeated addition.
 */
function* walkSlots(windowStart: Date, windowEnd: Date): Generator<Date> {
  for (let t = windowStart.getTime(); t < windowEnd.getTime(); t += SLOT_MS) {
    yield new Date(t);
  }
}

function classifyFreeSlot(
  slotStart: Date,
  now: Date,
  minBookableAt: Date,
  maxBookableAt: Date,
): { bookable: boolean; reason?: UnbookableReason } {
  if (slotStart < now) return { bookable: false, reason: 'past' };
  if (slotStart < minBookableAt) return { bookable: false, reason: 'too_soon' };
  if (slotStart >= maxBookableAt)
    return { bookable: false, reason: 'beyond_horizon' };
  return { bookable: true };
}

export async function getAvailability(
  deps: AvailabilityDeps,
  input: GetAvailabilityInput,
): Promise<GetAvailabilityOutput> {
  const { rows: resourceWindows, total } = await listResourcesWithWindows(
    deps.pool,
    {
      date: input.date,
      studioTimeZone: deps.config.studioTimeZone,
      typeIds: input.typeIds,
      from: input.from,
      to: input.to,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    },
  );

  const resourceIds = resourceWindows.map((r) => r.id);

  // The booked-slots query needs *a* range wide enough to cover every
  // resource's window on this page -- min/max across what query 1 already
  // returned, computed in JS, rather than a third SQL round trip to resolve
  // the calendar day's bounds separately (performance.md's "exactly two
  // queries" for the generation itself; the count above is the extra query
  // every paginated list endpoint already pays).
  let dayStart: Date | null = null;
  let dayEnd: Date | null = null;
  for (const r of resourceWindows) {
    if (r.windowStart >= r.windowEnd) continue; // no slots on this resource
    if (!dayStart || r.windowStart < dayStart) dayStart = r.windowStart;
    if (!dayEnd || r.windowEnd > dayEnd) dayEnd = r.windowEnd;
  }

  const bookedSlots =
    dayStart && dayEnd
      ? await listBookedSlotsForResources(deps.pool, resourceIds, dayStart, dayEnd)
      : [];

  // resourceId -> isoInstant -> memberId. The memberId never leaves this
  // function except as the boolean "is it mine" comparison below -- that is
  // the entire privacy boundary (security.md > Authorization).
  const bookedByResource = new Map<string, Map<string, string>>();
  for (const slot of bookedSlots) {
    let byInstant = bookedByResource.get(slot.resourceId);
    if (!byInstant) {
      byInstant = new Map();
      bookedByResource.set(slot.resourceId, byInstant);
    }
    byInstant.set(slot.slotStart.toISOString(), slot.memberId);
  }

  const now = new Date();
  const minBookableAt = new Date(now.getTime() + MIN_NOTICE_MINUTES * 60 * 1000);
  const maxBookableAt = new Date(
    now.getTime() + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );

  const resources: AvailabilityResourceDto[] = resourceWindows.map((resource) => {
    const byInstant = bookedByResource.get(resource.id);
    const slots: AvailabilitySlotDto[] = [];

    for (const slotStart of walkSlots(resource.windowStart, resource.windowEnd)) {
      const iso = slotStart.toISOString();
      const memberId = byInstant?.get(iso);

      if (memberId === undefined) {
        const { bookable, reason } = classifyFreeSlot(
          slotStart,
          now,
          minBookableAt,
          maxBookableAt,
        );
        slots.push({
          start: iso,
          status: 'free',
          bookable,
          ...(reason ? { reason } : {}),
        });
        continue;
      }

      const status: SlotStatus =
        memberId === input.requestingMemberId ? 'mine' : 'booked';
      slots.push({ start: iso, status, bookable: false });
    }

    return {
      id: resource.id,
      name: resource.name,
      typeId: resource.typeId,
      capacity: resource.capacity,
      slots,
    };
  });

  return { resources, total, page: input.page, pageSize: input.pageSize };
}
