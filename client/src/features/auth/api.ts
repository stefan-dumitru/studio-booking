import type { PublicUser } from './types.js';

/**
 * Mirrors server/src/errors.ts's AppError shape -- the stable {code, message}
 * (and optional problems[]) convention from ui-guidelines.md > Feedback &
 * Error States, so a component can switch on `code` without parsing text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems?: readonly string[];

  constructor(
    status: number,
    code: string,
    message: string,
    problems?: readonly string[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.problems = problems;
  }
}

interface SessionResponse {
  readonly user: PublicUser;
  readonly csrfToken: string;
}

interface MeResponse {
  readonly user: PublicUser;
  readonly csrfToken: string;
}

async function apiFetch<T>(
  path: string,
  init: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const { csrfToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

  // Same-origin because the Vite dev proxy and the production build both
  // serve the client and API from one origin -- no cross-site credentialed
  // requests exist in this app (client/vite.config.ts).
  const response = await fetch(`/api${path}`, {
    ...rest,
    headers,
    credentials: 'same-origin',
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as {
      code?: string;
      message?: string;
      problems?: readonly string[];
    } | null;
    throw new ApiError(
      response.status,
      errorBody?.code ?? 'UNKNOWN',
      errorBody?.message ?? 'Something went wrong.',
      errorBody?.problems,
    );
  }

  return body as T;
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
