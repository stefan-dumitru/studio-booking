import type { Pool } from 'pg';
import {
  BOOKING_HORIZON_DAYS,
  CANCEL_CUTOFF_HOURS,
  MAX_ACTIVE_BOOKINGS,
  MIN_NOTICE_MINUTES,
  SLOT_MINUTES,
} from '@studio/shared';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { withTransaction } from '../db/withTransaction.js';
import { lockResourceForBookingCheck } from '../db/queries/resources.js';
import { lockUserForBookingCheck } from '../db/queries/users.js';
import { recordAuditEvent } from '../db/queries/auditLog.js';
import {
  countActiveBookingsForMember,
  deleteBookingSlotsForBooking,
  findAlreadyTakenSlots,
  insertBooking,
  insertBookingSlots,
  listBookingsForAdmin,
  listBookingsForMember,
  lockBookingForCancel,
  markBookingCancelled,
} from '../db/queries/bookings.js';
import type { AdminBookingStatusFilter, BookingScope } from '../db/queries/bookings.js';
import { localDateStringInZone } from './timeUtil.js';
import { toAdminBookingDto, toBookingDto } from '../db/types.js';
import type { AdminBookingDto, BookingDto } from '../db/types.js';

export interface BookingDeps {
  readonly pool: Pool;
  readonly config: Config;
}

export interface CreateBookingInput {
  readonly resourceId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly memberId: string;
}

function generateSlotStarts(startsAt: Date, endsAt: Date): Date[] {
  const slots: Date[] = [];
  for (
    let t = startsAt.getTime();
    t < endsAt.getTime();
    t += SLOT_MINUTES * 60 * 1000
  ) {
    slots.push(new Date(t));
  }
  return slots;
}

export class SlotTakenError extends AppError {
  constructor(slots: readonly Date[]) {
    super(
      409,
      'SLOT_TAKEN',
      'One or more of these slots was just taken.',
      undefined,
      {
        slots: slots.map((s) => s.toISOString()),
      },
    );
  }
}

/**
 * Every rule in this order is re-checked here regardless of what the client
 * already greyed out -- the client's view is a convenience, never a control
 * (functional.md > Create a booking: "Every rule above is re-checked
 * server-side inside the transaction").
 */
export async function createBooking(
  deps: BookingDeps,
  input: CreateBookingInput,
): Promise<BookingDto> {
  const slotStarts = generateSlotStarts(input.startsAt, input.endsAt);

  const row = await withTransaction(deps.pool, async (client) => {
    // 1. Resource exists, isn't archived. FOR SHARE -- see the doc comment
    // on lockResourceForBookingCheck for the race this closes.
    const localDate = localDateStringInZone(
      input.startsAt,
      deps.config.studioTimeZone,
    );
    const resource = await lockResourceForBookingCheck(
      client,
      input.resourceId,
      localDate,
      deps.config.studioTimeZone,
    );
    if (!resource)
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'That resource does not exist.',
      );
    if (resource.archivedAt) {
      throw new AppError(
        409,
        'RESOURCE_ARCHIVED',
        'That resource is no longer bookable.',
      );
    }

    // 2. Every requested slot falls inside the resource's opening window.
    if (
      input.startsAt < resource.windowStart ||
      input.endsAt > resource.windowEnd
    ) {
      throw new AppError(
        409,
        'OUTSIDE_OPENING_HOURS',
        'This time falls outside the resource’s opening hours.',
      );
    }

    // 3. Minimum notice and booking horizon.
    const now = new Date();
    const minBookableAt = new Date(now.getTime() + MIN_NOTICE_MINUTES * 60 * 1000);
    const maxBookableAt = new Date(
      now.getTime() + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000,
    );
    if (input.startsAt < minBookableAt) {
      throw new AppError(
        409,
        'TOO_SOON',
        `Bookings need at least ${MIN_NOTICE_MINUTES} minutes' notice.`,
      );
    }
    if (input.startsAt >= maxBookableAt) {
      throw new AppError(
        409,
        'BEYOND_HORIZON',
        `Nothing can be booked more than ${BOOKING_HORIZON_DAYS} days ahead.`,
      );
    }

    // 4. The member's own 3-active-bookings cap. FOR UPDATE on their own
    // row -- see lockUserForBookingCheck's doc comment for the race this
    // closes (race #4: this member's own concurrent attempts, not anyone
    // else's).
    const member = await lockUserForBookingCheck(client, input.memberId);
    if (!member)
      throw new AppError(
        404,
        'MEMBER_NOT_FOUND',
        'Your account could not be found.',
      );
    const activeCount = await countActiveBookingsForMember(client, input.memberId);
    if (activeCount >= MAX_ACTIVE_BOOKINGS) {
      throw new AppError(
        409,
        'BOOKING_LIMIT_REACHED',
        `You can hold at most ${MAX_ACTIVE_BOOKINGS} upcoming bookings at a time.`,
      );
    }

    // 5. Pre-check for a friendly message in the common, non-racing case.
    const alreadyTaken = await findAlreadyTakenSlots(
      client,
      input.resourceId,
      slotStarts,
    );
    if (alreadyTaken.length > 0) {
      throw new SlotTakenError(alreadyTaken);
    }

    // 6. The actual control: booking_slots' PRIMARY KEY (resource_id,
    // slot_start). If a concurrent request won the race between the
    // pre-check above and this insert, this raises 23505 and the whole
    // transaction rolls back -- the loser never half-commits.
    const booking = await insertBooking(client, {
      resourceId: input.resourceId,
      memberId: input.memberId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });

    try {
      await insertBookingSlots(client, booking.id, input.resourceId, slotStarts);
    } catch (error) {
      if (isUniqueViolationOnBookingSlots(error)) {
        // The rare genuine race: we don't know precisely which slot(s) the
        // winner took without a savepoint-based post-mortem query, which
        // isn't worth the complexity here -- the client's job on a 409 is
        // just "refetch and show what's actually free now", not enumerate
        // the exact culprit (ui-guidelines.md > Key Flows).
        throw new SlotTakenError(slotStarts);
      }
      throw error;
    }

    return booking;
  });

  return toBookingDto(row);
}

function isUniqueViolationOnBookingSlots(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23505' && pgError?.constraint === 'booking_slots_pkey';
}

export interface MyBookingDto extends BookingDto {
  readonly resourceName: string;
}

export interface ListMyBookingsInput {
  readonly memberId: string;
  readonly scope: BookingScope;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListMyBookingsResult {
  readonly items: readonly MyBookingDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listMyBookings(
  deps: BookingDeps,
  input: ListMyBookingsInput,
): Promise<ListMyBookingsResult> {
  const { rows, total } = await listBookingsForMember(deps.pool, {
    memberId: input.memberId,
    scope: input.scope,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });
  return {
    items: rows.map((row) => ({ ...toBookingDto(row), resourceName: row.resourceName })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export class BookingNotFoundError extends AppError {
  constructor() {
    super(404, 'BOOKING_NOT_FOUND', 'That booking does not exist.');
  }
}

export class CancelForbiddenError extends AppError {
  constructor() {
    super(403, 'CANCEL_FORBIDDEN', 'You can only cancel your own bookings.');
  }
}

export class CancelWindowClosedError extends AppError {
  constructor() {
    super(
      403,
      'CANCEL_WINDOW_CLOSED',
      `Bookings can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before they start.`,
    );
  }
}

export interface CancelOwnBookingInput {
  readonly bookingId: string;
  readonly memberId: string;
}

/**
 * Member-scoped cancellation: ownership-checked, cutoff-enforced, never
 * audited (a member acting on their own booking is deliberately excluded --
 * security.md > Audit / Logging). cancelBookingAsAdmin below is the other
 * shape of this same operation -- any booking, no cutoff, always audited.
 */
export async function cancelOwnBooking(
  deps: BookingDeps,
  input: CancelOwnBookingInput,
): Promise<BookingDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    const booking = await lockBookingForCancel(client, input.bookingId);
    if (!booking) throw new BookingNotFoundError();
    // 403, not 404 -- the booking exists, this member just isn't allowed to
    // touch it (functional.md > Phase 4: a named test, not an incidental
    // choice).
    if (booking.memberId !== input.memberId) throw new CancelForbiddenError();

    // Idempotent no-op: a double-clicked cancel, or a retried request,
    // returns the same 200 rather than erroring (operations.md > "the
    // booking id is the idempotency key").
    if (booking.status === 'cancelled') return booking;

    const cutoff = new Date(
      booking.startsAt.getTime() - CANCEL_CUTOFF_HOURS * 60 * 60 * 1000,
    );
    if (new Date() >= cutoff) throw new CancelWindowClosedError();

    const cancelled = await markBookingCancelled(client, input.bookingId, input.memberId);
    // The statement that actually frees the slot.
    await deleteBookingSlotsForBooking(client, input.bookingId);
    return cancelled;
  });

  return toBookingDto(row);
}

export interface CancelBookingAsAdminInput {
  readonly bookingId: string;
  readonly actorId: string;
}

/**
 * The admin shape of cancellation: any booking, no ownership check, no
 * cutoff (functional.md > Cancel a booking: "This check does not apply to
 * admins"). Always audited on the state-changing path -- the idempotent
 * already-cancelled no-op writes nothing, since there is no action to
 * record (security.md > Audit / Logging: written in the same transaction
 * as the action it describes).
 */
export async function cancelBookingAsAdmin(
  deps: BookingDeps,
  input: CancelBookingAsAdminInput,
): Promise<BookingDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    const booking = await lockBookingForCancel(client, input.bookingId);
    if (!booking) throw new BookingNotFoundError();
    if (booking.status === 'cancelled') return booking;

    const cancelled = await markBookingCancelled(client, input.bookingId, input.actorId);
    await deleteBookingSlotsForBooking(client, input.bookingId);
    await recordAuditEvent(client, {
      action: 'admin.booking.cancel',
      actorId: input.actorId,
      targetType: 'booking',
      targetId: input.bookingId,
      detail: { memberId: booking.memberId },
    });
    return cancelled;
  });

  return toBookingDto(row);
}

export interface ListAllBookingsInput {
  readonly q: string;
  readonly resourceId: string | null;
  readonly status: AdminBookingStatusFilter;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListAllBookingsResult {
  readonly items: readonly AdminBookingDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listAllBookings(
  deps: BookingDeps,
  input: ListAllBookingsInput,
): Promise<ListAllBookingsResult> {
  const { rows, total } = await listBookingsForAdmin(deps.pool, {
    q: input.q,
    resourceId: input.resourceId,
    status: input.status,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    studioTimeZone: deps.config.studioTimeZone,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });
  return {
    items: rows.map(toAdminBookingDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
