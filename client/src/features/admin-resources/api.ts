import { apiFetch } from '../../lib/apiClient.js';
import type { PagedResult, ResourceDto, ResourceStatusFilter } from './types.js';

export interface ListResourcesParams {
  readonly q: string;
  readonly typeId: string | null;
  readonly status: ResourceStatusFilter;
  readonly page: number;
}

export function listResources(
  params: ListResourcesParams,
): Promise<PagedResult<ResourceDto>> {
  const search = new URLSearchParams({
    status: params.status,
    page: String(params.page),
    pageSize: '50',
  });
  if (params.q) search.set('q', params.q);
  if (params.typeId) search.set('typeId', params.typeId);

  return apiFetch(`/admin/resources?${search.toString()}`, { method: 'GET' });
}

export interface ResourceFormInput {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
}

export function createResource(
  input: ResourceFormInput,
  csrfToken: string,
): Promise<{ resource: ResourceDto }> {
  return apiFetch('/admin/resources', {
    method: 'POST',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export function updateResource(
  id: string,
  input: ResourceFormInput & { acknowledgeStrandedBookings?: boolean },
  csrfToken: string,
): Promise<{ resource: ResourceDto }> {
  return apiFetch(`/admin/resources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export function archiveResource(
  id: string,
  csrfToken: string,
): Promise<{ message: string }> {
  return apiFetch(`/admin/resources/${id}/archive`, { method: 'POST', csrfToken });
}

export function unarchiveResource(
  id: string,
  csrfToken: string,
): Promise<{ message: string }> {
  return apiFetch(`/admin/resources/${id}/unarchive`, {
    method: 'POST',
    csrfToken,
  });
}
