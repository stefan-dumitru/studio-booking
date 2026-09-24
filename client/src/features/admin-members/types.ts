export type UserRole = 'member' | 'admin';
export type UserStatus = 'pending_verification' | 'active' | 'deactivated';

export interface AdminMemberDto {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly emailVerifiedAt: string | null;
  readonly deactivatedAt: string | null;
  readonly createdAt: string;
}

export type AdminMemberStatusFilter = 'active' | 'pending_verification' | 'deactivated' | 'all';

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
