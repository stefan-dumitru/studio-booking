import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { STUDIO_TIME_ZONE } from '@studio/shared';
import { useAuth } from '../auth/AuthContext.js';
import { Button } from '../../components/ui/Button.js';
import * as api from './api.js';
import { Filters } from './Filters.js';
import { AvailabilityGrid } from './AvailabilityGrid.js';
import type { GridSelection } from './AvailabilityGrid.js';
import { BookingConfirmDialog } from '../bookings/BookingConfirmDialog.js';

function todayInStudioZone(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TIME_ZONE }).format(
    new Date(),
  );
}

/**
 * The member landing screen (replaces the Phase 0/1/2 placeholder home
 * screen) -- ui-guidelines.md > Key Flows: "drops the member on Browse...
 * the point is to book, not read a confirmation."
 */
export function BrowsePage(): React.JSX.Element {
  const { state, logout } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';

  const [date, setDate] = useState(todayInStudioZone);
  const [typeIds, setTypeIds] = useState<readonly string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  // Selecting slots (click, shift-click, Shift+Arrow) only builds the
  // selection -- the dialog needs its own explicit trigger, since opening it
  // immediately on the first click would trap focus in the modal before a
  // drag/shift-click extension could ever happen (ui-guidelines.md > Key
  // Flows: "dragging or shift-clicking to extend" implies extension finishes
  // before confirmation starts).
  // null = closed; a number = open, captured at the moment it opened (an
  // event handler, not render) -- see BookingConfirmDialog's openedAtMs prop.
  const [confirmDialogOpenedAt, setConfirmDialogOpenedAt] = useState<number | null>(
    null,
  );

  const typesQuery = useQuery({
    queryKey: ['resourceTypes'],
    queryFn: () => api.listResourceTypes(),
    staleTime: 5 * 60 * 1000, // performance.md: resource types "change about never".
  });

  const availabilityQuery = useQuery({
    queryKey: ['availability', { date, typeIds, from, to, page }],
    queryFn: () => api.getAvailability({ date, typeIds, from, to, page }),
  });

  const selectedResource = availabilityQuery.data?.resources.find(
    (r) => r.id === selection?.resourceId,
  );

  return (
    <main className="min-h-dvh bg-white px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Studio Booking</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/bookings"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              My bookings
            </Link>
            {/* Not rendered for a member -- ui-guidelines.md > Information
                Architecture. The server enforces this independently either way. */}
            {state.status === 'authenticated' && state.user.role === 'admin' && (
              <Link
                to="/admin/resources"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
              >
                Admin
              </Link>
            )}
            <Button variant="secondary" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <Filters
            date={date}
            onDateChange={(d) => {
              setDate(d);
              setPage(1);
            }}
            typeIds={typeIds}
            onTypeIdsChange={(ids) => {
              setTypeIds(ids);
              setPage(1);
            }}
            resourceTypes={typesQuery.data?.resourceTypes ?? []}
            from={from}
            onFromChange={(v) => {
              setFrom(v);
              setPage(1);
            }}
            to={to}
            onToChange={(v) => {
              setTo(v);
              setPage(1);
            }}
          />
        </div>

        {availabilityQuery.isLoading && <p className="mt-6 text-sm">Loading…</p>}

        {availabilityQuery.data && (
          <>
            <AvailabilityGrid
              resources={availabilityQuery.data.resources}
              selection={selection}
              onSelectionChange={setSelection}
            />

            <div className="mt-4 flex items-center justify-between text-sm">
              <span>{availabilityQuery.data.total} resources</span>
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
                  disabled={
                    page * availabilityQuery.data.pageSize >=
                    availabilityQuery.data.total
                  }
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        {selection && selection.slotStarts.length > 0 && (
          <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
            <Button
              className="shadow-lg"
              onClick={() => setConfirmDialogOpenedAt(Date.now())}
            >
              Book {selection.slotStarts.length} slot
              {selection.slotStarts.length === 1 ? '' : 's'}
            </Button>
          </div>
        )}
      </div>

      {confirmDialogOpenedAt !== null &&
        selection &&
        selectedResource &&
        selection.slotStarts.length > 0 && (
          <BookingConfirmDialog
            resourceId={selection.resourceId}
            resourceName={selectedResource.name}
            startsAt={selection.slotStarts[0]!}
            endsAt={new Date(
              new Date(
                selection.slotStarts[selection.slotStarts.length - 1]!,
              ).getTime() +
                30 * 60 * 1000,
            ).toISOString()}
            csrfToken={csrfToken}
            openedAtMs={confirmDialogOpenedAt}
            onClose={() => setConfirmDialogOpenedAt(null)}
            onBooked={() => {
              setConfirmDialogOpenedAt(null);
              setSelection(null);
            }}
          />
        )}
    </main>
  );
}
