import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import {
  screen,
  waitFor,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react';
import { ResourceTypesPage } from './ResourceTypesPage.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';
import { renderRoutes } from '../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const adminMeResponse = () =>
  jsonResponse(200, {
    user: {
      id: '1',
      email: 'admin@example.com',
      displayName: 'Admin',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    },
    csrfToken: 'token-abc',
  });

function renderPage(): void {
  renderRoutes(
    { '/admin/resource-types': <ResourceTypesPage /> },
    '/admin/resource-types',
  );
}

describe('ResourceTypesPage', () => {
  it('shows an empty state when there are no resource types', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no resource types yet/i)).toBeInTheDocument();
    });
  });

  it('lists existing resource types', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, {
          items: [
            { id: '1', name: 'Rehearsal Room', sortOrder: 0, archivedAt: null },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Rehearsal Room')).toBeInTheDocument(),
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('creates a resource type and shows a confirmation toast', async () => {
    const { calls } = mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
      'POST /api/admin/resource-types': () =>
        jsonResponse(201, {
          resourceType: { id: '9', name: 'Desk', sortOrder: 0, archivedAt: null },
        }),
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no resource types yet/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /add type/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Desk' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText('Resource type created.')).toBeInTheDocument();
    });

    const createCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/admin/resource-types',
    );
    expect(createCall).toBeDefined();
  });

  it('shows the server validation error inline instead of a generic message', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
      'POST /api/admin/resource-types': () =>
        jsonResponse(409, {
          code: 'RESOURCE_TYPE_NAME_TAKEN',
          message: 'A resource type with that name already exists.',
        }),
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no resource types yet/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /add type/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Desk' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    });
  });

  it('archives a resource type after confirmation', async () => {
    const { calls } = mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, {
          items: [
            { id: '1', name: 'Rehearsal Room', sortOrder: 0, archivedAt: null },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      'POST /api/admin/resource-types/1/archive': () =>
        jsonResponse(200, { message: 'Resource type archived.' }),
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Rehearsal Room')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    const confirmDialog = screen.getByRole('alertdialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: /^archive$/i }),
    );

    await waitFor(() => {
      expect(screen.getByText('Resource type archived.')).toBeInTheDocument();
    });
    expect(
      calls.some(
        (c) =>
          c.method === 'POST' && c.path === '/api/admin/resource-types/1/archive',
      ),
    ).toBe(true);
  });

  it('shows the blocking error when archiving is rejected', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': () =>
        jsonResponse(200, {
          items: [
            { id: '1', name: 'Rehearsal Room', sortOrder: 0, archivedAt: null },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      'POST /api/admin/resource-types/1/archive': () =>
        jsonResponse(409, {
          code: 'RESOURCE_TYPE_HAS_ACTIVE_RESOURCES',
          message:
            'This resource type still has active resources. Archive or reassign them first.',
        }),
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Rehearsal Room')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    const confirmDialog = screen.getByRole('alertdialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: /^archive$/i }),
    );

    await waitFor(() => {
      expect(
        within(confirmDialog).getByText(/still has active resources/),
      ).toBeInTheDocument();
    });
  });
});
