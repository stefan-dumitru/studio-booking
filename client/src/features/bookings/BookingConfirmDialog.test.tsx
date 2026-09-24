import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui/Toast.js';
import { BookingConfirmDialog } from './BookingConfirmDialog.js';
import { mockApiRoutes, jsonResponse } from '../../test-support/mockApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(
  props: Partial<Parameters<typeof BookingConfirmDialog>[0]> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onBooked: ReturnType<typeof vi.fn>;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onBooked = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BookingConfirmDialog
          resourceId="r1"
          resourceName="Room A"
          startsAt="2027-06-01T10:00:00.000Z"
          endsAt="2027-06-01T10:30:00.000Z"
          csrfToken="token-abc"
          openedAtMs={new Date('2027-06-01T08:00:00.000Z').getTime()}
          onClose={onClose}
          onBooked={onBooked}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { onClose, onBooked };
}

describe('BookingConfirmDialog', () => {
  it('shows the cancellation warning when the booking starts under 2 hours from now', () => {
    renderDialog({
      startsAt: '2027-06-01T09:30:00.000Z', // 1.5h after openedAtMs (08:00)
      openedAtMs: new Date('2027-06-01T08:00:00.000Z').getTime(),
    });

    expect(
      screen.getByText(/won.t be able to cancel it yourself/i),
    ).toBeInTheDocument();
  });

  it('does not show the warning when the booking starts 2+ hours out', () => {
    renderDialog({
      startsAt: '2027-06-01T11:00:00.000Z', // 3h after openedAtMs (08:00)
      openedAtMs: new Date('2027-06-01T08:00:00.000Z').getTime(),
    });

    expect(
      screen.queryByText(/won.t be able to cancel it yourself/i),
    ).not.toBeInTheDocument();
  });

  it('confirms successfully and calls onBooked', async () => {
    mockApiRoutes({
      'POST /api/bookings': () =>
        jsonResponse(201, {
          booking: {
            id: 'b1',
            resourceId: 'r1',
            startsAt: '2027-06-01T10:00:00.000Z',
            endsAt: '2027-06-01T10:30:00.000Z',
            status: 'booked',
          },
        }),
    });
    const { onBooked } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onBooked).toHaveBeenCalled());
  });

  it('shows a friendly message and stays open on a 409 SLOT_TAKEN, without calling onBooked', async () => {
    mockApiRoutes({
      'POST /api/bookings': () =>
        jsonResponse(409, {
          code: 'SLOT_TAKEN',
          message: 'One or more of these slots was just taken.',
          slots: ['2027-06-01T10:00:00.000Z'],
        }),
    });
    const { onBooked } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /someone just took this slot/i,
      );
    });
    expect(onBooked).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the generic message for a non-conflict error', async () => {
    mockApiRoutes({
      'POST /api/bookings': () =>
        jsonResponse(409, {
          code: 'OUTSIDE_OPENING_HOURS',
          message: 'This time falls outside hours.',
        }),
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This time falls outside hours.',
      );
    });
  });
});
