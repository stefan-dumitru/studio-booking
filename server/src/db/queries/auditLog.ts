import type { Queryable } from '../types.js';

/**
 * Every action name written by this phase, kept as a union so a typo becomes
 * a type error rather than a silent gap in the log.
 * specifications/security.md > Audit / Logging is the source of truth.
 */
export type AuditAction =
  | 'login.success'
  | 'login.failure'
  | 'logout'
  | 'password.reset_requested'
  | 'password.reset_completed'
  | 'email.verified'
  | 'resource_type.create'
  | 'resource_type.update'
  | 'resource_type.archive'
  | 'resource_type.unarchive'
  | 'resource.create'
  | 'resource.update'
  | 'resource.archive'
  | 'resource.unarchive';

export interface AuditLogInput {
  readonly actorId?: string | null;
  readonly actorEmailAttempted?: string | null;
  readonly action: AuditAction;
  readonly targetType?: 'user' | 'resource' | 'resource_type' | '';
  readonly targetId?: string | null;
  readonly detail?: Record<string, unknown>;
  readonly ip?: string | null;
}

/**
 * Always called inside the caller's own transaction, so an action is never
 * recorded without succeeding and never succeeds without being recorded
 * (specifications/security.md > Audit / Logging).
 */
export async function recordAuditEvent(
  db: Queryable,
  input: AuditLogInput,
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_email_attempted, action, target_type, target_id, detail, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.actorId ?? null,
      input.actorEmailAttempted ?? null,
      input.action,
      input.targetType ?? '',
      input.targetId ?? null,
      JSON.stringify(input.detail ?? {}),
      input.ip ?? null,
    ],
  );
}
