import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { withTransaction } from '../db/withTransaction.js';
import { recordAuditEvent } from '../db/queries/auditLog.js';
import { findResourceTypeById } from '../db/queries/resourceTypes.js';
import {
  archiveResourceRow,
  countFutureActiveBookings,
  findBookingsOutsideHours,
  findFutureActiveBookingsWithMember,
  findResourceById,
  insertResource,
  lockResourceForWrite,
  listResources,
  unarchiveResourceRow,
  updateResource as updateResourceRow,
} from '../db/queries/resources.js';
import { toResourceDto } from '../db/types.js';
import type { ConflictingBookingDto, ResourceDto } from '../db/types.js';
import type { ResourceStatusFilter } from '../db/queries/resources.js';

export interface ResourceDeps {
  readonly pool: Pool;
  readonly config: Config;
}

/** Shared by create and update: a resource's type must exist and be active. */
async function assertTypeUsable(
  db: Parameters<typeof findResourceTypeById>[0],
  typeId: string,
): Promise<void> {
  const type = await findResourceTypeById(db, typeId);
  if (!type)
    throw new AppError(
      404,
      'RESOURCE_TYPE_NOT_FOUND',
      'That resource type does not exist.',
    );
  if (type.archivedAt) {
    throw new AppError(
      409,
      'RESOURCE_TYPE_ARCHIVED',
      'That resource type is archived and cannot be assigned to a resource.',
    );
  }
}

export interface CreateResourceInput {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly actorId: string;
}

export async function createResource(
  deps: ResourceDeps,
  input: CreateResourceInput,
): Promise<ResourceDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    await assertTypeUsable(client, input.typeId);

    const created = await insertResource(client, {
      name: input.name,
      typeId: input.typeId,
      description: input.description,
      capacity: input.capacity,
      openTime: input.openTime,
      closeTime: input.closeTime,
    });

    await recordAuditEvent(client, {
      action: 'resource.create',
      actorId: input.actorId,
      targetType: 'resource',
      targetId: created.id,
    });
    return created;
  });

  return toResourceDto(row);
}

export interface UpdateResourceInput {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly acknowledgeStrandedBookings: boolean;
  readonly actorId: string;
}

export class StrandedBookingsError extends AppError {
  constructor(bookings: readonly ConflictingBookingDto[]) {
    super(
      409,
      'BOOKINGS_OUTSIDE_NEW_HOURS',
      'Narrowing the hours would leave existing bookings outside them.',
      undefined,
      { bookings },
    );
  }
}

export async function updateResource(
  deps: ResourceDeps,
  id: string,
  input: UpdateResourceInput,
): Promise<ResourceDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    // Locked for the duration of this transaction -- see lockResourceForWrite's
    // doc comment on the race this closes.
    const existing = await lockResourceForWrite(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'That resource does not exist.',
      );

    await assertTypeUsable(client, input.typeId);

    // Postgres returns TIME columns as "HH:MM:SS"; the client sends "HH:MM"
    // (an <input type="time"> value). Comparing the two lengths directly is
    // wrong: "09:00" < "09:00:00" by plain string ordering (a prefix always
    // sorts before the longer string it prefixes), which would misfire as
    // "narrowed" on an exact, unchanged value. Normalise both to "HH:MM"
    // first -- exactly what toResourceDto already does for the client.
    const existingOpenTime = existing.openTime.slice(0, 5);
    const existingCloseTime = existing.closeTime.slice(0, 5);
    const isNarrowingHours =
      input.openTime > existingOpenTime || input.closeTime < existingCloseTime;

    if (isNarrowingHours && !input.acknowledgeStrandedBookings) {
      const stranded = await findBookingsOutsideHours(
        client,
        id,
        deps.config.studioTimeZone,
        input.openTime,
        input.closeTime,
      );
      if (stranded.length > 0) {
        throw new StrandedBookingsError(stranded);
      }
    }

    // Compares against the normalised existing*Time locals for the two time
    // fields (same "HH:MM" vs "HH:MM:SS" mismatch as isNarrowingHours above),
    // and existing[field] directly for the rest.
    const changedFields: string[] = (
      ['name', 'typeId', 'description', 'capacity'] as const
    ).filter((field) => existing[field] !== input[field]);
    if (input.openTime !== existingOpenTime) changedFields.push('openTime');
    if (input.closeTime !== existingCloseTime) changedFields.push('closeTime');

    const updated = await updateResourceRow(client, id, {
      name: input.name,
      typeId: input.typeId,
      description: input.description,
      capacity: input.capacity,
      openTime: input.openTime,
      closeTime: input.closeTime,
    });

    if (changedFields.length > 0) {
      await recordAuditEvent(client, {
        action: 'resource.update',
        actorId: input.actorId,
        targetType: 'resource',
        targetId: id,
        detail: { changedFields },
      });
    }
    return updated;
  });

  return toResourceDto(row);
}

export class ResourceHasBookingsError extends AppError {
  constructor(bookings: readonly ConflictingBookingDto[]) {
    super(
      409,
      'RESOURCE_HAS_BOOKINGS',
      'This resource has future bookings. Cancel them before archiving.',
      undefined,
      { bookings },
    );
  }
}

export async function archiveResource(
  deps: ResourceDeps,
  id: string,
  actorId: string,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const existing = await lockResourceForWrite(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'That resource does not exist.',
      );
    if (existing.archivedAt) return; // already archived: idempotent no-op

    const activeCount = await countFutureActiveBookings(client, id);
    if (activeCount > 0) {
      const bookings = await findFutureActiveBookingsWithMember(client, id);
      throw new ResourceHasBookingsError(bookings);
    }

    await archiveResourceRow(client, id);
    await recordAuditEvent(client, {
      action: 'resource.archive',
      actorId,
      targetType: 'resource',
      targetId: id,
    });
  });
}

export async function unarchiveResource(
  deps: ResourceDeps,
  id: string,
  actorId: string,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const existing = await findResourceById(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_NOT_FOUND',
        'That resource does not exist.',
      );
    if (!existing.archivedAt) return; // already active: idempotent no-op

    await unarchiveResourceRow(client, id);
    await recordAuditEvent(client, {
      action: 'resource.unarchive',
      actorId,
      targetType: 'resource',
      targetId: id,
    });
  });
}

export interface ListResourcesInput {
  readonly q: string;
  readonly typeId: string | null;
  readonly status: ResourceStatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListResourcesOutput {
  readonly items: readonly ResourceDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listResourcesForAdmin(
  deps: ResourceDeps,
  input: ListResourcesInput,
): Promise<ListResourcesOutput> {
  const { rows, total } = await listResources(deps.pool, {
    q: input.q,
    typeId: input.typeId,
    status: input.status,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });

  return {
    items: rows.map(toResourceDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
