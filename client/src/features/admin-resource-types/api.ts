import { apiFetch } from '../../lib/apiClient.js';
import type { PagedResult, ResourceTypeDto } from './types.js';

export function listResourceTypes(
  includeArchived: boolean,
): Promise<PagedResult<ResourceTypeDto>> {
  const query = includeArchived
    ? '?includeArchived=true&pageSize=50'
    : '?pageSize=50';
  return apiFetch(`/admin/resource-types${query}`, { method: 'GET' });
}

export interface ResourceTypeInput {
  readonly name: string;
  readonly sortOrder: number;
}

export function createResourceType(
  input: ResourceTypeInput,
  csrfToken: string,
): Promise<{ resourceType: ResourceTypeDto }> {
  return apiFetch('/admin/resource-types', {
    method: 'POST',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export function updateResourceType(
  id: string,
  input: ResourceTypeInput,
  csrfToken: string,
): Promise<{ resourceType: ResourceTypeDto }> {
  return apiFetch(`/admin/resource-types/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export function archiveResourceType(
  id: string,
  csrfToken: string,
): Promise<{ message: string }> {
  return apiFetch(`/admin/resource-types/${id}/archive`, {
    method: 'POST',
    csrfToken,
  });
}

export function unarchiveResourceType(
  id: string,
  csrfToken: string,
): Promise<{ message: string }> {
  return apiFetch(`/admin/resource-types/${id}/unarchive`, {
    method: 'POST',
    csrfToken,
  });
}
