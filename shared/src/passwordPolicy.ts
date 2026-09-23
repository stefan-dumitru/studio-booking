/**
 * The password policy, shared so the client and the server cannot disagree
 * about what counts as acceptable (specifications/security.md > Authentication).
 *
 * The server is the control; the client imports this only to show the rule
 * before the form is submitted.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Guards against a pasted essay becoming an expensive bcrypt call. */
export const PASSWORD_MAX_LENGTH = 200;

export interface PasswordCheck {
  readonly valid: boolean;
  /** Every failed rule, so the user can fix them in one pass. */
  readonly problems: readonly string[];
}

export function checkPassword(password: string): PasswordCheck {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    problems.push('must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    problems.push('must contain an uppercase letter');
  }
  if (!/\d/.test(password)) {
    problems.push('must contain a digit');
  }

  return { valid: problems.length === 0, problems };
}
