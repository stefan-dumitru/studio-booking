import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { App } from './App.js';

/**
 * Covers what the component promises: it reports ok, it reports a degraded
 * database distinctly from an unreachable API, and it never renders a raw error.
 */

function mockFetch(implementation: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App health panel', () => {
  it('reports ok when the API says the database is reachable', async () => {
    mockFetch(async () => jsonResponse(200, { status: 'ok', db: 'ok' }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/^OK —/);
    });
  });

  it('distinguishes a reachable API with an unreachable database', async () => {
    mockFetch(async () =>
      jsonResponse(503, { status: 'degraded', db: 'unreachable' }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /cannot reach the database/,
      );
    });
  });

  it('reports the API being down, which fetch surfaces as a rejection', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /Could not reach the API/,
      );
    });
  });

  it('shows a loading state before the check resolves', () => {
    mockFetch(() => new Promise<Response>(() => {}));

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking…');
  });
});
