import { apiFetch } from '../../lib/apiClient.js';
import type { AvailabilityResult, ResourceType } from './types.js';

export interface AvailabilityParams {
  readonly date: string;
  readonly typeIds: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly page: number;
}

export function getAvailability(
  params: AvailabilityParams,
): Promise<AvailabilityResult> {
  const search = new URLSearchParams({
    date: params.date,
    page: String(params.page),
  });
  if (params.typeIds.length > 0) search.set('typeIds', params.typeIds.join(','));
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);

  return apiFetch(`/availability?${search.toString()}`, { method: 'GET' });
}

export function listResourceTypes(): Promise<{ resourceTypes: ResourceType[] }> {
  return apiFetch('/resource-types', { method: 'GET' });
}
