import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext.js';
import { RequireAdmin } from './RequireAdmin.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAdminProtected(): void {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route path="/verify-email" element={<div>Verify screen</div>} />
          <Route path="/" element={<div>Home screen</div>} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin area</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function userMeResponse(status: string, role: string): Response {
  return jsonResponse(200, {
    user: {
      id: '1',
      email: 'x@example.com',
      displayName: 'X',
      role,
      status,
      emailVerifiedAt: status === 'active' ? '2026-01-01T00:00:00.000Z' : null,
    },
    csrfToken: 'token-abc',
  });
}

describe('RequireAdmin', () => {
  it('redirects an unauthenticated visitor to /login', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
    });

    renderAdminProtected();

    await waitFor(() =>
      expect(screen.getByText('Login screen')).toBeInTheDocument(),
    );
  });

  it('redirects a pending session to /verify-email', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () => userMeResponse('pending_verification', 'member'),
    });

    renderAdminProtected();

    await waitFor(() =>
      expect(screen.getByText('Verify screen')).toBeInTheDocument(),
    );
  });

  it('redirects a verified non-admin member to /', async () => {
    mockApiRoutes({ 'GET /api/auth/me': () => userMeResponse('active', 'member') });

    renderAdminProtected();

    await waitFor(() =>
      expect(screen.getByText('Home screen')).toBeInTheDocument(),
    );
  });

  it('renders the admin route for a verified admin', async () => {
    mockApiRoutes({ 'GET /api/auth/me': () => userMeResponse('active', 'admin') });

    renderAdminProtected();

    await waitFor(() => expect(screen.getByText('Admin area')).toBeInTheDocument());
  });
});
