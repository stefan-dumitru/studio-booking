import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { withTransaction } from '../db/withTransaction.js';
import { recordAuditEvent } from '../db/queries/auditLog.js';
import { destroySessionsForUser } from '../db/queries/sessions.js';
import {
  cancelAllActiveBookingsForMember,
  countBookingsStartingOnDate,
  deleteBookingSlotsForBookings,
} from '../db/queries/bookings.js';
import { countArchivedResources } from '../db/queries/resources.js';
import {
  countPendingVerificationMembers,
  findUserById,
  listUsersForAdmin,
  lockActiveAdmins,
  setUserRole,
  setUserStatus,
} from '../db/queries/users.js';
import type { AdminMemberStatusFilter } from '../db/queries/users.js';
import { localDateStringInZone } from './timeUtil.js';
import { toAdminMemberDto } from '../db/types.js';
import type { AdminMemberDto, UserRole } from '../db/types.js';

export interface MemberDeps {
  readonly pool: Pool;
  readonly config: Config;
}

export class MemberNotFoundError extends AppError {
  constructor() {
    super(404, 'MEMBER_NOT_FOUND', 'That member does not exist.');
  }
}

export class CannotDeactivateSelfError extends AppError {
  constructor() {
    super(403, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.');
  }
}

export class LastActiveAdminError extends AppError {
  constructor() {
    super(
      409,
      'LAST_ACTIVE_ADMIN',
      'At least one active admin must remain -- promote another member first.',
    );
  }
}

export interface ListMembersInput {
  readonly q: string;
  readonly status: AdminMemberStatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListMembersResult {
  readonly items: readonly AdminMemberDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listMembers(
  deps: MemberDeps,
  input: ListMembersInput,
): Promise<ListMembersResult> {
  const { rows, total } = await listUsersForAdmin(deps.pool, {
    q: input.q,
    status: input.status,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  });
  return {
    items: rows.map(toAdminMemberDto),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export interface DeactivateMemberInput {
  readonly targetId: string;
  readonly actorId: string;
}

/**
 * functional.md > Deactivate a member. An admin cannot deactivate
 * themselves (unconditionally -- not just when they're the last admin: this
 * flow is not the way to step down), and cannot deactivate the last active
 * admin (data-model.md > users: the invariant, enforced here with
 * lockActiveAdmins the same way changeMemberRole enforces it for demotion).
 */
export async function deactivateMember(
  deps: MemberDeps,
  input: DeactivateMemberInput,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const target = await findUserById(client, input.targetId);
    if (!target) throw new MemberNotFoundError();
    if (input.targetId === input.actorId) throw new CannotDeactivateSelfError();
    if (target.status === 'deactivated') return; // idempotent no-op

    if (target.role === 'admin') {
      const activeAdmins = await lockActiveAdmins(client);
      if (activeAdmins.length <= 1) throw new LastActiveAdminError();
    }

    await setUserStatus(client, input.targetId, 'deactivated');
    const cancelledBookingIds = await cancelAllActiveBookingsForMember(
      client,
      input.targetId,
      input.actorId,
    );
    await deleteBookingSlotsForBookings(client, cancelledBookingIds);
    await destroySessionsForUser(client, input.targetId);

    await recordAuditEvent(client, {
      action: 'admin.member.deactivate',
      actorId: input.actorId,
      targetType: 'user',
      targetId: input.targetId,
      detail: { cancelledBookingIds },
    });
  });
}

export interface ReactivateMemberInput {
  readonly targetId: string;
  readonly actorId: string;
}

/** Restores login only -- functional.md is explicit that bookings cancelled
 * by deactivation are not restored. */
export async function reactivateMember(
  deps: MemberDeps,
  input: ReactivateMemberInput,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const target = await findUserById(client, input.targetId);
    if (!target) throw new MemberNotFoundError();
    if (target.status !== 'deactivated') return; // idempotent no-op

    await setUserStatus(client, input.targetId, 'active');
    await recordAuditEvent(client, {
      action: 'admin.member.reactivate',
      actorId: input.actorId,
      targetType: 'user',
      targetId: input.targetId,
    });
  });
}

export interface ChangeMemberRoleInput {
  readonly targetId: string;
  readonly actorId: string;
  readonly newRole: UserRole;
}

/**
 * data-model.md > users: "at least one active admin must exist at all
 * times... enforced in application code... for demote". The narrower rule
 * in functional.md > User Roles ("an admin cannot demote itself if it is
 * the last remaining admin") is the single-admin instance of this same
 * general check, not a separate rule -- it applies equally to one admin
 * demoting another.
 */
export async function changeMemberRole(
  deps: MemberDeps,
  input: ChangeMemberRoleInput,
): Promise<void> {
  await withTransaction(deps.pool, async (client) => {
    const target = await findUserById(client, input.targetId);
    if (!target) throw new MemberNotFoundError();
    if (target.role === input.newRole) return; // idempotent no-op

    if (target.role === 'admin' && input.newRole === 'member' && target.status === 'active') {
      const activeAdmins = await lockActiveAdmins(client);
      if (activeAdmins.length <= 1) throw new LastActiveAdminError();
    }

    await setUserRole(client, input.targetId, input.newRole);
    await recordAuditEvent(client, {
      action: 'admin.member.role_change',
      actorId: input.actorId,
      targetType: 'user',
      targetId: input.targetId,
      detail: { from: target.role, to: input.newRole },
    });
  });
}

export interface AdminSummary {
  readonly todayBookingCount: number;
  readonly archivedResourceCount: number;
  readonly pendingVerificationCount: number;
}

/** functional.md > User Roles: "an admin landing view showing today's
 * booking count, the count of resources currently archived, and the count
 * of members awaiting verification." Read-only -- no transaction needed. */
export async function getAdminSummary(deps: MemberDeps): Promise<AdminSummary> {
  const today = localDateStringInZone(new Date(), deps.config.studioTimeZone);

  const [todayBookingCount, archivedResourceCount, pendingVerificationCount] =
    await Promise.all([
      countBookingsStartingOnDate(deps.pool, today, deps.config.studioTimeZone),
      countArchivedResources(deps.pool),
      countPendingVerificationMembers(deps.pool),
    ]);

  return { todayBookingCount, archivedResourceCount, pendingVerificationCount };
}
