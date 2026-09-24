import { checkPassword } from '@studio/shared';
import { EMAIL_PATTERN, ValidationErrors, readString } from './shared.js';

export interface RegisterBody {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export function validateRegisterBody(body: unknown): RegisterBody {
  const errors = new ValidationErrors();

  const email = readString(body, 'email').trim();
  if (!email) errors.add('email', 'is required');
  else if (!EMAIL_PATTERN.test(email))
    errors.add('email', 'is not a valid email address');

  const displayName = readString(body, 'displayName').trim();
  if (displayName.length < 1 || displayName.length > 80) {
    errors.add('displayName', 'must be between 1 and 80 characters');
  }

  const password = readString(body, 'password');
  const passwordCheck = checkPassword(password);
  if (!passwordCheck.valid) {
    for (const problem of passwordCheck.problems) errors.add('password', problem);
  }

  errors.throwIfAny();
  return { email, displayName, password };
}

export interface EmailBody {
  readonly email: string;
}

export function validateEmailBody(body: unknown): EmailBody {
  const errors = new ValidationErrors();
  const email = readString(body, 'email').trim();
  if (!email) errors.add('email', 'is required');
  else if (!EMAIL_PATTERN.test(email))
    errors.add('email', 'is not a valid email address');
  errors.throwIfAny();
  return { email };
}

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export function validateLoginBody(body: unknown): LoginBody {
  const errors = new ValidationErrors();
  const email = readString(body, 'email').trim();
  if (!email) errors.add('email', 'is required');
  const password = readString(body, 'password');
  if (!password) errors.add('password', 'is required');
  errors.throwIfAny();
  // Deliberately not validating email shape or password policy here: a
  // malformed login attempt should fail as "invalid credentials", the same
  // as any other wrong login, not leak shape information via a different
  // error path.
  return { email, password };
}

export interface TokenBody {
  readonly token: string;
}

export function validateTokenBody(body: unknown): TokenBody {
  const errors = new ValidationErrors();
  const token = readString(body, 'token').trim();
  if (!token) errors.add('token', 'is required');
  errors.throwIfAny();
  return { token };
}

export interface ResetPasswordBody {
  readonly token: string;
  readonly password: string;
}

export function validateResetPasswordBody(body: unknown): ResetPasswordBody {
  const errors = new ValidationErrors();
  const token = readString(body, 'token').trim();
  if (!token) errors.add('token', 'is required');

  const password = readString(body, 'password');
  const passwordCheck = checkPassword(password);
  if (!passwordCheck.valid) {
    for (const problem of passwordCheck.problems) errors.add('password', problem);
  }

  errors.throwIfAny();
  return { token, password };
}
