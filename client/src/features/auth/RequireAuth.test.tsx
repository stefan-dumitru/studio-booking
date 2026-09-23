import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext.js';
import { RequireAuth } from './RequireAuth.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderProtected(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/verify-email" element={<div>Verify screen</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<div>Home screen</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('redirects an unauthenticated visitor to /login', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
    });

    renderProtected();

    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument();
    });
  });

  it('redirects a pending session to /verify-email', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(200, {
          user: {
            id: '1',
            email: 'ana@example.com',
            displayName: 'Ana',
            role: 'member',
            status: 'pending_verification',
            emailVerifiedAt: null,
          },
          csrfToken: 'token-abc',
        }),
    });

    renderProtected();

    await waitFor(() => {
      expect(screen.getByText('Verify screen')).toBeInTheDocument();
    });
  });

  it('renders the protected route for an active session', async () => {
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

    renderProtected();

    await waitFor(() => {
      expect(screen.getByText('Home screen')).toBeInTheDocument();
    });
  });
});
