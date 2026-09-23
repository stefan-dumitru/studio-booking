import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';

function Probe(): React.JSX.Element {
  const { state } = useAuth();
  return (
    <div role="status">
      {state.status}
      {state.status === 'authenticated' ? `:${state.user.email}` : ''}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthProvider bootstrap', () => {
  it('becomes unauthenticated when /me returns 401', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('loading');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('unauthenticated');
    });
  });

  it('becomes authenticated when /me returns a user', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
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

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'authenticated:ana@example.com',
      );
    });
  });
});
