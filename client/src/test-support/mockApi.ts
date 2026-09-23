import { vi } from 'vitest';

export type RouteHandler = (
  init: RequestInit | undefined,
) => Response | Promise<Response>;

/** Maps "METHOD path" to a handler, dispatched by a single mocked fetch. */
export function mockApiRoutes(routes: Record<string, RouteHandler>): {
  calls: { method: string; path: string }[];
} {
  const calls: { method: string; path: string }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ method, path });

      const handler = routes[`${method} ${path}`];
      if (!handler) {
        throw new Error(`No mock route for ${method} ${path}`);
      }
      return Promise.resolve(handler(init));
    }),
  );

  return { calls };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
