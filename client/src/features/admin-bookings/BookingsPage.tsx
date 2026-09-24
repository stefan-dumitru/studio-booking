import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STUDIO_TIME_ZONE } from '@studio/shared';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import { AlertDialog } from '../../components/ui/AlertDialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Label } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import * as resourceApi from '../admin-resources/api.js';
import * as api from './api.js';
import type { AdminBookingDto, AdminBookingStatusFilter } from './types.js';

const SEARCH_DEBOUNCE_MS = 300; // performance.md > Constraints

const rangeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function BookingsPage(): React.JSX.Element {
  const { state } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminBookingStatusFilter>('booked');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<AdminBookingDto | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qInput]);

  const resourcesQuery = useQuery({
    queryKey: ['admin', 'resources', 'forBookingFilter'],
    queryFn: () => resourceApi.listResources({ q: '', typeId: null, status: 'all', page: 1 }),
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'bookings', { q, resourceId, status, dateFrom, dateTo, page }],
    queryFn: () => api.listBookings({ q, resourceId, status, dateFrom, dateTo, page }),
  });

  const cancelMutation = useMutation({
    mutationFn: (booking: AdminBookingDto) => api.cancelBooking(booking.id, csrfToken),
    onSuccess: () => {
      showToast('Booking cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      setCancelTarget(null);
    },
  });

  const cancelError =
    cancelMutation.error instanceof ApiError ? cancelMutation.error.message : null;

  const resourceOptions = (resourcesQuery.data?.items ?? []).map((r) => ({
    value: r.id,
    label: r.name,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Bookings</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search by member name or email…"
          value={qInput}
          onChange={(event) => {
            setQInput(event.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={resourceId ?? ''}
          onValueChange={(value) => {
            setResourceId(value || null);
            setPage(1);
          }}
          options={[{ value: '', label: 'All resources' }, ...resourceOptions]}
          placeholder="All resources"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as AdminBookingStatusFilter);
            setPage(1);
          }}
          options={[
            { value: 'booked', label: 'Booked' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div>
          <Label htmlFor="bookings-date-from">From</Label>
          <Input
            id="bookings-date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="bookings-date-to">To</Label>
          <Input
            id="bookings-date-to"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {listQuery.isLoading && <p className="mt-4 text-sm">Loading…</p>}

      {listQuery.data && listQuery.data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No bookings match these filters.
        </p>
      )}

      {listQuery.data && listQuery.data.items.length > 0 && (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Resource</th>
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.items.map((booking) => (
                <tr key={booking.id} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="py-2">
                    {booking.memberDisplayName}
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      {booking.memberEmail}
                    </div>
                  </td>
                  <td className="py-2">{booking.resourceName}</td>
                  <td className="py-2">
                    {rangeFormatter.format(new Date(booking.startsAt))} –{' '}
                    {rangeFormatter.format(new Date(booking.endsAt))}
                  </td>
                  <td className="py-2">
                    {booking.status === 'booked' ? 'Booked' : 'Cancelled'}
                  </td>
                  <td className="py-2">
                    {booking.status === 'booked' && (
                      <Button variant="destructive" onClick={() => setCancelTarget(booking)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              {listQuery.data.total} booking{listQuery.data.total === 1 ? '' : 's'}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page * 50 >= listQuery.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {cancelTarget && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setCancelTarget(null);
              cancelMutation.reset();
            }
          }}
          title="Cancel this booking?"
          description={
            <>
              <strong>{cancelTarget.memberDisplayName}</strong>'s booking for{' '}
              {cancelTarget.resourceName}, {rangeFormatter.format(new Date(cancelTarget.startsAt))}.
              They will not be notified.
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
    </div>
  );
}
