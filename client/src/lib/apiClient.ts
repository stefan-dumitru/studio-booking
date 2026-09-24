/**
 * Mirrors server/src/errors.ts's AppError shape -- the stable {code, message}
 * (and optional problems[] / extra detail fields) convention from
 * ui-guidelines.md > Feedback & Error States, so a component can switch on
 * `code` without parsing text. `raw` carries the full parsed body so a
 * caller can pull out an error-specific field (e.g. `bookings` on a 409)
 * without this base class needing to know every shape in advance.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems?: readonly string[];
  readonly raw: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    problems: readonly string[] | undefined,
    raw: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.problems = problems;
    this.raw = raw;
  }
}

/**
 * Shared by every feature's api.ts. Same-origin because the Vite dev proxy
 * and the production build both serve the client and API from one origin --
 * no cross-site credentialed requests exist in this app (client/vite.config.ts).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const { csrfToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

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
      body,
    );
  }

  return body as T;
}
