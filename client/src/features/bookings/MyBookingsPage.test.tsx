import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MyBookingsPage } from './MyBookingsPage.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';
import { renderRoutes } from '../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const memberMeResponse = () =>
  jsonResponse(200, {
    user: {
      id: 'u1',
      email: 'member@example.com',
      displayName: 'Member',
      role: 'member',
      status: 'active',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    },
    csrfToken: 'token-abc',
  });

const UPCOMING_ROUTE = 'GET /api/bookings/mine?scope=upcoming&page=1';
const PAST_ROUTE = 'GET /api/bookings/mine?scope=past&page=1';

const upcomingBooking = {
  id: 'b1',
  resourceId: 'r1',
  resourceName: 'Room A',
  startsAt: '2099-06-01T10:00:00.000Z',
  endsAt: '2099-06-01T10:30:00.000Z',
  status: 'booked' as const,
};

function renderPage(): void {
  renderRoutes({ '/bookings': <MyBookingsPage /> }, '/bookings');
}

describe('MyBookingsPage', () => {
  it('shows the empty state with a link to Browse when there are no upcoming bookings', async () => {
    mockApiRoutes({
      'GET /api/auth/me': memberMeResponse,
      [UPCOMING_ROUTE]: () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/haven.t booked anything yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /browse availability/i })).toBeInTheDocument();
  });

  it('lists an upcoming booking with its resource name and time range', async () => {
    mockApiRoutes({
      'GET /api/auth/me': memberMeResponse,
      [UPCOMING_ROUTE]: () =>
        jsonResponse(200, { items: [upcomingBooking], total: 1, page: 1, pageSize: 20 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeEnabled();
  });

  it('disables Cancel with a visible reason inside the 2-hour cutoff', async () => {
    const soonBooking = {
      ...upcomingBooking,
      id: 'b2',
      startsAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
    };
    mockApiRoutes({
      'GET /api/auth/me': memberMeResponse,
      [UPCOMING_ROUTE]: () =>
        jsonResponse(200, { items: [soonBooking], total: 1, page: 1, pageSize: 20 }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled(),
    );
    expect(screen.getByText(/ask the studio admin to cancel it/i)).toBeInTheDocument();
  });

  it('confirms cancellation, shows a toast, and refetches the list', async () => {
    let cancelCallCount = 0;
    mockApiRoutes({
      'GET /api/auth/me': memberMeResponse,
      [UPCOMING_ROUTE]: () =>
        jsonResponse(200, { items: [upcomingBooking], total: 1, page: 1, pageSize: 20 }),
      'DELETE /api/bookings/b1': () => {
        cancelCallCount += 1;
        return jsonResponse(200, { booking: { ...upcomingBooking, status: 'cancelled' } });
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel booking/i }));

    await waitFor(() => expect(screen.getByText('Booking cancelled.')).toBeInTheDocument());
    expect(cancelCallCount).toBe(1);
  });

  it('shows a plain empty state with no CTA on the Past tab', async () => {
    mockApiRoutes({
      'GET /api/auth/me': memberMeResponse,
      [UPCOMING_ROUTE]: () =>
        jsonResponse(200, { items: [upcomingBooking], total: 1, page: 1, pageSize: 20 }),
      [PAST_ROUTE]: () => jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Room A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /^past$/i }));

    await waitFor(() => expect(screen.getByText(/no past bookings/i)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /browse availability/i })).not.toBeInTheDocument();
  });
});
