import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import {
  screen,
  waitFor,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react';
import { ResourcesPage } from './ResourcesPage.js';
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

const oneType = () =>
  jsonResponse(200, {
    items: [{ id: 't1', name: 'Rehearsal Room', sortOrder: 0, archivedAt: null }],
    total: 1,
    page: 1,
    pageSize: 50,
  });

const RESOURCES_LIST_ROUTE =
  'GET /api/admin/resources?status=active&page=1&pageSize=50';

function renderPage(): void {
  renderRoutes({ '/admin/resources': <ResourcesPage /> }, '/admin/resources');
}

describe('ResourcesPage', () => {
  it('shows an empty state when there are no resources', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resourceTypes': oneType,
      'GET /api/admin/resource-types?pageSize=50': oneType,
      [RESOURCES_LIST_ROUTE]: () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no resources match/i)).toBeInTheDocument();
    });
  });

  it('lists resources with their type name and hours', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': oneType,
      [RESOURCES_LIST_ROUTE]: () =>
        jsonResponse(200, {
          items: [
            {
              id: 'r1',
              name: 'Room A',
              typeId: 't1',
              description: '',
              capacity: 6,
              openTime: '08:00',
              closeTime: '22:00',
              archivedAt: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());
    expect(screen.getByText('Rehearsal Room')).toBeInTheDocument();
    expect(screen.getByText('08:00–22:00')).toBeInTheDocument();
  });

  it('creates a resource using the default (first) type and shows a toast', async () => {
    const { calls } = mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': oneType,
      [RESOURCES_LIST_ROUTE]: () =>
        jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
      'POST /api/admin/resources': () =>
        jsonResponse(201, {
          resource: {
            id: 'r9',
            name: 'Room A',
            typeId: 't1',
            description: '',
            capacity: 1,
            openTime: '08:00',
            closeTime: '20:00',
            archivedAt: null,
          },
        }),
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add resource/i })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Room A' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText('Resource created.')).toBeInTheDocument(),
    );

    const createCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/admin/resources',
    );
    expect(createCall).toBeDefined();
  });

  it('shows the stranded-bookings conflict and lets the admin save anyway', async () => {
    const strandedBooking = {
      bookingId: 'b1',
      startsAt: '2027-06-01T08:00:00.000Z',
      endsAt: '2027-06-01T08:30:00.000Z',
      memberDisplayName: 'Ana',
    };

    let updateCallCount = 0;
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': oneType,
      [RESOURCES_LIST_ROUTE]: () =>
        jsonResponse(200, {
          items: [
            {
              id: 'r1',
              name: 'Room A',
              typeId: 't1',
              description: '',
              capacity: 6,
              openTime: '08:00',
              closeTime: '22:00',
              archivedAt: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      'PATCH /api/admin/resources/r1': (init) => {
        updateCallCount += 1;
        const body = JSON.parse(init?.body as string) as {
          acknowledgeStrandedBookings?: boolean;
        };
        if (!body.acknowledgeStrandedBookings) {
          return jsonResponse(409, {
            code: 'BOOKINGS_OUTSIDE_NEW_HOURS',
            message:
              'Narrowing the hours would leave existing bookings outside them.',
            bookings: [strandedBooking],
          });
        }
        return jsonResponse(200, {
          resource: {
            id: 'r1',
            name: 'Room A',
            typeId: 't1',
            description: '',
            capacity: 6,
            openTime: '12:00',
            closeTime: '22:00',
            archivedAt: null,
          },
        });
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const dialog = screen.getByRole('dialog');
    const openTimeInput = within(dialog).getByLabelText(
      'Opens',
    ) as HTMLInputElement;
    fireEvent.change(openTimeInput, { target: { value: '12:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/leave 1 existing booking/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/Ana/)).toBeInTheDocument();
    });
    expect(updateCallCount).toBe(1);

    fireEvent.click(within(dialog).getByRole('button', { name: /save anyway/i }));

    await waitFor(() =>
      expect(screen.getByText('Resource updated.')).toBeInTheDocument(),
    );
    expect(updateCallCount).toBe(2);
  });

  it('shows the blocking bookings when archive is rejected', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resource-types?pageSize=50': oneType,
      [RESOURCES_LIST_ROUTE]: () =>
        jsonResponse(200, {
          items: [
            {
              id: 'r1',
              name: 'Room A',
              typeId: 't1',
              description: '',
              capacity: 6,
              openTime: '08:00',
              closeTime: '22:00',
              archivedAt: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      'POST /api/admin/resources/r1/archive': () =>
        jsonResponse(409, {
          code: 'RESOURCE_HAS_BOOKINGS',
          message:
            'This resource has future bookings. Cancel them before archiving.',
          bookings: [
            {
              bookingId: 'b1',
              startsAt: '2027-06-01T08:00:00.000Z',
              endsAt: '2027-06-01T08:30:00.000Z',
              memberDisplayName: 'Ana',
            },
          ],
        }),
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    const confirmDialog = screen.getByRole('alertdialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: /^archive$/i }),
    );

    await waitFor(() => {
      expect(
        within(confirmDialog).getByText(/cancel them before archiving/i),
      ).toBeInTheDocument();
      expect(within(confirmDialog).getByText(/Ana/)).toBeInTheDocument();
    });
  });
});
