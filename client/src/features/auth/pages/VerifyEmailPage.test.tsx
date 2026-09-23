import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import { VerifyEmailPage } from './VerifyEmailPage.js';
import { mockApiRoutes, jsonResponse } from '../../../test-support/mockApi.js';
import { renderRoutes } from '../../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string): void {
  renderRoutes(
    { '/verify-email': <VerifyEmailPage />, '/': <div>Home screen</div> },
    path,
    { strict: true },
  );
}

describe('VerifyEmailPage', () => {
  it('consumes the token exactly once even under Strict Mode, then navigates home', async () => {
    const { calls } = mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/verify-email': () =>
        jsonResponse(200, {
          user: {
            id: '1',
            email: 'ana@example.com',
            displayName: 'Ana',
            role: 'member',
            status: 'active',
            emailVerifiedAt: '2026-01-01T00:00:00.000Z',
          },
          csrfToken: 'token-abc',
        }),
    });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => {
      expect(screen.getByText('Home screen')).toBeInTheDocument();
    });

    const verifyCalls = calls.filter((c) => c.path === '/api/auth/verify-email');
    expect(verifyCalls).toHaveLength(1);
  });

  it('shows the server error for an already-used token', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/verify-email': () =>
        jsonResponse(400, {
          code: 'TOKEN_ALREADY_USED',
          message: 'This link has already been used.',
        }),
    });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('already been used');
    });
  });

  it('shows the resend gate when there is no token and no session', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
    });

    renderAt('/verify-email');

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });
  });
});
