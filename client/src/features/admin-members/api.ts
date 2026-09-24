import { apiFetch } from '../../lib/apiClient.js';
import type { AdminMemberDto, AdminMemberStatusFilter, PagedResult } from './types.js';

export interface ListMembersParams {
  readonly q: string;
  readonly status: AdminMemberStatusFilter;
  readonly page: number;
}

export function listMembers(
  params: ListMembersParams,
): Promise<PagedResult<AdminMemberDto>> {
  const search = new URLSearchParams({ status: params.status, page: String(params.page) });
  if (params.q) search.set('q', params.q);
  return apiFetch(`/admin/members?${search.toString()}`, { method: 'GET' });
}

export function deactivateMember(id: string, csrfToken: string): Promise<{ message: string }> {
  return apiFetch(`/admin/members/${id}/deactivate`, { method: 'POST', csrfToken });
}

export function reactivateMember(id: string, csrfToken: string): Promise<{ message: string }> {
  return apiFetch(`/admin/members/${id}/reactivate`, { method: 'POST', csrfToken });
}

export function promoteMember(id: string, csrfToken: string): Promise<{ message: string }> {
  return apiFetch(`/admin/members/${id}/promote`, { method: 'POST', csrfToken });
}

export function demoteMember(id: string, csrfToken: string): Promise<{ message: string }> {
  return apiFetch(`/admin/members/${id}/demote`, { method: 'POST', csrfToken });
}
