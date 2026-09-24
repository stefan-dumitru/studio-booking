import type { Pool } from 'pg';
import { AppError } from '../errors.js';
import { withTransaction } from '../db/withTransaction.js';
import { isUniqueViolation } from '../db/pgErrors.js';
import { recordAuditEvent } from '../db/queries/auditLog.js';
import {
  archiveResourceTypeRow,
  countActiveResourcesForType,
  findResourceTypeById,
  insertResourceType,
  listResourceTypes,
  unarchiveResourceTypeRow,
  updateResourceType as updateResourceTypeRow,
} from '../db/queries/resourceTypes.js';
import { toResourceTypeDto } from '../db/types.js';
import type { ResourceTypeDto } from '../db/types.js';

export interface ResourceTypeDeps {
  readonly pool: Pool;
}

function mapNameConflict(error: unknown): never {
  if (isUniqueViolation(error, 'resource_types_name_key')) {
    throw new AppError(
      409,
      'RESOURCE_TYPE_NAME_TAKEN',
      'A resource type with that name already exists.',
    );
  }
  throw error;
}

export interface CreateResourceTypeInput {
  readonly name: string;
  readonly sortOrder: number;
  readonly actorId: string;
}

export async function createResourceType(
  deps: ResourceTypeDeps,
  input: CreateResourceTypeInput,
): Promise<ResourceTypeDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    let created;
    try {
      created = await insertResourceType(client, {
        name: input.name,
        sortOrder: input.sortOrder,
      });
    } catch (error) {
      mapNameConflict(error);
    }
    await recordAuditEvent(client, {
      action: 'resource_type.create',
      actorId: input.actorId,
      targetType: 'resource_type',
      targetId: created.id,
    });
    return created;
  });

  return toResourceTypeDto(row);
}

export interface UpdateResourceTypeInput {
  readonly name: string;
  readonly sortOrder: number;
  readonly actorId: string;
}

export async function updateResourceType(
  deps: ResourceTypeDeps,
  id: string,
  input: UpdateResourceTypeInput,
): Promise<ResourceTypeDto> {
  const row = await withTransaction(deps.pool, async (client) => {
    const existing = await findResourceTypeById(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_TYPE_NOT_FOUND',
        'That resource type does not exist.',
      );

    const changedFields = Object.keys({
      ...(existing.name !== input.name ? { name: true } : {}),
      ...(existing.sortOrder !== input.sortOrder ? { sortOrder: true } : {}),
    });

    let updated;
    try {
      updated = await updateResourceTypeRow(client, id, {
        name: input.name,
        sortOrder: input.sortOrder,
      });
    } catch (error) {
      mapNameConflict(error);
    }

    if (changedFields.length > 0) {
      await recordAuditEvent(client, {
        action: 'resource_type.update',
        actorId: input.actorId,
        targetType: 'resource_type',
        targetId: id,
        detail: { changedFields },
      });
    }
    return updated;
  });

  return toResourceTypeDto(row);
}

export async function archiveResourceType(
  deps: ResourceTypeDeps,
  id: string,
  actorId: string,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const existing = await findResourceTypeById(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_TYPE_NOT_FOUND',
        'That resource type does not exist.',
      );
    if (existing.archivedAt) return; // already archived: idempotent no-op

    const activeCount = await countActiveResourcesForType(client, id);
    if (activeCount > 0) {
      throw new AppError(
        409,
        'RESOURCE_TYPE_HAS_ACTIVE_RESOURCES',
        'This resource type still has active resources. Archive or reassign them first.',
      );
    }

    await archiveResourceTypeRow(client, id);
    await recordAuditEvent(client, {
      action: 'resource_type.archive',
      actorId,
      targetType: 'resource_type',
      targetId: id,
    });
  });
}

export async function unarchiveResourceType(
  deps: ResourceTypeDeps,
  id: string,
  actorId: string,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const existing = await findResourceTypeById(client, id);
    if (!existing)
      throw new AppError(
        404,
        'RESOURCE_TYPE_NOT_FOUND',
        'That resource type does not exist.',
      );
    if (!existing.archivedAt) return; // already active: idempotent no-op

    await unarchiveResourceTypeRow(client, id);
    await recordAuditEvent(client, {
      action: 'resource_type.unarchive',
      actorId,
      targetType: 'resource_type',
      targetId: id,
    });
  });
}

export interface ListResourceTypesInput {
  readonly includeArchived: boolean;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListResourceTypesOutput {
  readonly items: readonly ResourceTypeDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listResourceTypesForAdmin(
  deps: ResourceTypeDeps,
  input: ListResourceTypesInput,
): Promise<ListResourceTypesOutput> {
  const { rows, total } = await listResourceTypes(deps.pool, {
    includeArchived: input.includeArchived,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });

  return {
    items: rows.map(toResourceTypeDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
