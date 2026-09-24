import { apiFetch } from '../../lib/apiClient.js';
import type { PublicUser } from './types.js';

export { ApiError } from '../../lib/apiClient.js';

interface SessionResponse {
  readonly user: PublicUser;
  readonly csrfToken: string;
}

interface MeResponse {
  readonly user: PublicUser;
  readonly csrfToken: string;
}

export function register(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<{ message: string }> {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendVerification(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyEmail(token: string): Promise<SessionResponse> {
  return apiFetch('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function login(input: {
  email: string;
  password: string;
}): Promise<SessionResponse> {
  return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function logout(csrfToken: string): Promise<{ message: string }> {
  return apiFetch('/auth/logout', { method: 'POST', csrfToken });
}

export function me(): Promise<MeResponse> {
  return apiFetch('/auth/me', { method: 'GET' });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(input: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  return apiFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
