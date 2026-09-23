import { createHash, randomBytes } from 'node:crypto';

/** The value put in the emailed link. Never stored -- see hashToken below. */
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Only the hash is stored in email_tokens.token_hash (specifications/
 * data-model.md: "a database leak must not hand over working verification or
 * reset links").
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
