import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CANCEL_CUTOFF_HOURS, STUDIO_TIME_ZONE } from '@studio/shared';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import { AlertDialog } from '../../components/ui/AlertDialog.js';
import { Button } from '../../components/ui/Button.js';
import * as api from './api.js';
import type { BookingScope, MyBooking } from './types.js';

const rangeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const PAGE_SIZE = 20;

/**
 * ui-guidelines.md > Information Architecture: "/bookings -- My bookings
 * (upcoming and past)". Cancellation is member-scoped only here -- an admin
 * cancelling any booking is Phase 5 (functional.md > Build Phases).
 */
export function MyBookingsPage(): React.JSX.Element {
  const { state } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<BookingScope>('upcoming');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);

  const listQuery = useQuery({
    queryKey: ['bookings', 'mine', scope, page],
    queryFn: () => api.listMyBookings({ scope, page }),
  });

  const cancelMutation = useMutation({
    mutationFn: (booking: MyBooking) => api.cancelBooking(booking.id, csrfToken),
    onSuccess: () => {
      showToast('Booking cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
      // The slot this booking held is free again -- only visible on Browse
      // via this second invalidation (operations.md > Query Efficiency).
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      setCancelTarget(null);
    },
  });

  const cancelError =
    cancelMutation.error instanceof ApiError ? cancelMutation.error.message : null;

  return (
    <main className="min-h-dvh bg-white px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">My bookings</h1>
          <Link
            to="/"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Browse
          </Link>
        </div>

        <div className="mt-6 flex gap-2" role="tablist">
          <Button
            variant={scope === 'upcoming' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={scope === 'upcoming'}
            onClick={() => {
              setScope('upcoming');
              setPage(1);
            }}
          >
            Upcoming
          </Button>
          <Button
            variant={scope === 'past' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={scope === 'past'}
            onClick={() => {
              setScope('past');
              setPage(1);
            }}
          >
            Past
          </Button>
        </div>

        {listQuery.isLoading && <p className="mt-6 text-sm">Loading…</p>}

        {listQuery.data && listQuery.data.items.length === 0 && (
          <div className="mt-6 text-sm text-slate-600 dark:text-slate-400">
            {scope === 'upcoming' ? (
              <>
                <p>You haven&rsquo;t booked anything yet.</p>
                <Link to="/" className="mt-2 inline-block underline">
                  Browse availability
                </Link>
              </>
            ) : (
              <p>No past bookings.</p>
            )}
          </div>
        )}

        {listQuery.data && listQuery.data.items.length > 0 && (
          <>
            <ul className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
              {listQuery.data.items.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  scope={scope}
                  // React Query's own fetch-resolved timestamp, not a fresh
                  // Date.now() read during render (which react-hooks/purity
                  // correctly rejects) -- close enough to "now" for a
                  // disabled-button hint; the real control is server-side.
                  nowMs={listQuery.dataUpdatedAt}
                  onCancel={() => setCancelTarget(booking)}
                />
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span>{listQuery.data.total} booking{listQuery.data.total === 1 ? '' : 's'}</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page * PAGE_SIZE >= listQuery.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {cancelTarget && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setCancelTarget(null);
              cancelMutation.reset();
            }
          }}
          title="Cancel booking?"
          description={
            <>
              <strong>{cancelTarget.resourceName}</strong>
              <br />
              {rangeFormatter.format(new Date(cancelTarget.startsAt))} –{' '}
              {rangeFormatter.format(new Date(cancelTarget.endsAt))}
              {cancelError && (
                <p role="alert" className="mt-3 text-red-700 dark:text-red-400">
                  {cancelError}
                </p>
              )}
            </>
          }
          confirmLabel="Cancel booking"
          destructive
          confirmDisabled={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate(cancelTarget)}
        />
      )}
    </main>
  );
}

function BookingRow({
  booking,
  scope,
  nowMs,
  onCancel,
}: {
  booking: MyBooking;
  scope: BookingScope;
  nowMs: number;
  onCancel: () => void;
}): React.JSX.Element {
  const withinCutoff =
    new Date(booking.startsAt).getTime() - nowMs < CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;

  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium">{booking.resourceName}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {rangeFormatter.format(new Date(booking.startsAt))} –{' '}
          {rangeFormatter.format(new Date(booking.endsAt))}
        </p>
        {scope === 'past' && booking.status === 'cancelled' && (
          <p className="text-sm text-slate-500 dark:text-slate-500">Cancelled</p>
        )}
      </div>

      {scope === 'upcoming' && (
        <div className="text-right">
          <Button variant="destructive" disabled={withinCutoff} onClick={onCancel}>
            Cancel
          </Button>
          {withinCutoff && (
            <p className="mt-1 max-w-40 text-xs text-slate-500 dark:text-slate-500">
              Starts within {CANCEL_CUTOFF_HOURS} hours — ask the studio admin to cancel it.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
