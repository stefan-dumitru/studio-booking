/** Mirrors server/src/db/types.ts's PublicUser -- the fields the API ever sends. */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: 'member' | 'admin';
  readonly status: 'pending_verification' | 'active' | 'deactivated';
  readonly emailVerifiedAt: string | null;
}
