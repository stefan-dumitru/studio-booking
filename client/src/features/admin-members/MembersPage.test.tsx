import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MembersPage } from './MembersPage.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';
import { renderRoutes } from '../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const adminMeResponse = () =>
  jsonResponse(200, {
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Root Admin',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    },
    csrfToken: 'token-abc',
  });

const MEMBERS_ROUTE = 'GET /api/admin/members?status=all&page=1';

const activeMember = {
  id: 'm1',
  email: 'ana@example.com',
  displayName: 'Ana',
  role: 'member' as const,
  status: 'active' as const,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  deactivatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(): void {
  renderRoutes({ '/admin/members': <MembersPage /> }, '/admin/members');
}

describe('MembersPage', () => {
  it('shows an empty state when no members match the filters', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      [MEMBERS_ROUTE]: () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no members match/i)).toBeInTheDocument();
    });
  });

  it('lists a member and disables Deactivate on the current admin themselves', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      [MEMBERS_ROUTE]: () =>
        jsonResponse(200, {
          items: [
            activeMember,
            {
              id: 'admin-1',
              email: 'admin@example.com',
              displayName: 'Root Admin',
              role: 'admin',
              status: 'active',
              emailVerifiedAt: '2026-01-01T00:00:00.000Z',
              deactivatedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    const adminRow = screen.getByText('Root Admin').closest('tr')!;
    expect(within(adminRow).getByRole('button', { name: /^deactivate$/i })).toBeDisabled();
    expect(screen.getByText(/can.t deactivate your own account/i)).toBeInTheDocument();
  });

  it('confirms deactivation and shows a toast', async () => {
    let deactivateCallCount = 0;
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      [MEMBERS_ROUTE]: () =>
        jsonResponse(200, { items: [activeMember], total: 1, page: 1, pageSize: 50 }),
      'POST /api/admin/members/m1/deactivate': () => {
        deactivateCallCount += 1;
        return jsonResponse(200, { message: 'Member deactivated.' });
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() =>
      expect(screen.getByText('Deactivate succeeded.')).toBeInTheDocument(),
    );
    expect(deactivateCallCount).toBe(1);
  });

  it('shows the LAST_ACTIVE_ADMIN error inline when a demote is rejected', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      [MEMBERS_ROUTE]: () =>
        jsonResponse(200, {
          items: [
            {
              id: 'admin-1',
              email: 'admin@example.com',
              displayName: 'Root Admin',
              role: 'admin',
              status: 'active',
              emailVerifiedAt: '2026-01-01T00:00:00.000Z',
              deactivatedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      'POST /api/admin/members/admin-1/demote': () =>
        jsonResponse(409, {
          code: 'LAST_ACTIVE_ADMIN',
          message: 'At least one active admin must remain -- promote another member first.',
        }),
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Root Admin')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^demote$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /demote to member/i }));

    await waitFor(() => {
      expect(within(dialog).getByText(/at least one active admin must remain/i)).toBeInTheDocument();
    });
  });
});
