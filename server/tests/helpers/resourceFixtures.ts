import type { AdminSession } from './adminAgent.js';

export interface ResourceFixture {
  readonly typeId: string;
  readonly resourceId: string;
}

/** Creates one resource type and one resource under it via the real admin
 * API -- both availability and booking tests need a bookable resource to
 * exist, and going through the real endpoints exercises the same code path
 * Phase 2's own tests already cover in isolation. */
export async function createResourceFixture(
  admin: AdminSession,
  overrides: {
    typeName?: string;
    resourceName?: string;
    openTime?: string;
    closeTime?: string;
    capacity?: number;
  } = {},
): Promise<ResourceFixture> {
  const typeResponse = await admin.agent
    .post('/api/admin/resource-types')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      name: overrides.typeName ?? `Type ${Math.random().toString(36).slice(2)}`,
      sortOrder: 0,
    });
  const typeId = typeResponse.body.resourceType.id as string;

  const resourceResponse = await admin.agent
    .post('/api/admin/resources')
    .set('X-CSRF-Token', admin.csrfToken)
    .send({
      name:
        overrides.resourceName ?? `Resource ${Math.random().toString(36).slice(2)}`,
      typeId,
      description: '',
      capacity: overrides.capacity ?? 4,
      openTime: overrides.openTime ?? '08:00',
      closeTime: overrides.closeTime ?? '22:00',
    });
  const resourceId = resourceResponse.body.resource.id as string;

  return { typeId, resourceId };
}
