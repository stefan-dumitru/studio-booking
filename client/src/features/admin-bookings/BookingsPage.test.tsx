import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { BookingsPage } from './BookingsPage.js';
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

const noResources = () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 });

const BOOKINGS_ROUTE = 'GET /api/admin/bookings?status=booked&page=1&pageSize=50';

const booking = {
  id: 'b1',
  resourceId: 'r1',
  resourceName: 'Room A',
  startsAt: '2027-06-01T10:00:00.000Z',
  endsAt: '2027-06-01T10:30:00.000Z',
  status: 'booked' as const,
  memberDisplayName: 'Ana',
  memberEmail: 'ana@example.com',
};

function renderPage(): void {
  renderRoutes({ '/admin/bookings': <BookingsPage /> }, '/admin/bookings');
}

describe('BookingsPage', () => {
  it('shows an empty state when no bookings match the filters', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resources?status=all&page=1&pageSize=50': noResources,
      [BOOKINGS_ROUTE]: () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 50 }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no bookings match/i)).toBeInTheDocument();
    });
  });

  it('lists a booking with the member and resource', async () => {
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resources?status=all&page=1&pageSize=50': noResources,
      [BOOKINGS_ROUTE]: () =>
        jsonResponse(200, { items: [booking], total: 1, page: 1, pageSize: 50 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Room A')).toBeInTheDocument();
  });

  it('confirms cancellation and shows a toast', async () => {
    let cancelCallCount = 0;
    mockApiRoutes({
      'GET /api/auth/me': adminMeResponse,
      'GET /api/admin/resources?status=all&page=1&pageSize=50': noResources,
      [BOOKINGS_ROUTE]: () =>
        jsonResponse(200, { items: [booking], total: 1, page: 1, pageSize: 50 }),
      'DELETE /api/admin/bookings/b1': () => {
        cancelCallCount += 1;
        return jsonResponse(200, { booking: { ...booking, status: 'cancelled' } });
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel booking/i }));

    await waitFor(() => expect(screen.getByText('Booking cancelled.')).toBeInTheDocument());
    expect(cancelCallCount).toBe(1);
  });
});
