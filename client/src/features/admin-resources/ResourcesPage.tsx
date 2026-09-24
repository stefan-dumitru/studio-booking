import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { AlertDialog } from '../../components/ui/AlertDialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Label, Textarea } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import * as resourceTypeApi from '../admin-resource-types/api.js';
import * as api from './api.js';
import type {
  ConflictingBookingDto,
  ResourceDto,
  ResourceStatusFilter,
} from './types.js';

const SEARCH_DEBOUNCE_MS = 300; // performance.md > Constraints

export function ResourcesPage(): React.JSX.Element {
  const { state } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [status, setStatus] = useState<ResourceStatusFilter>('active');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qInput]);

  const [editing, setEditing] = useState<ResourceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ResourceDto | null>(null);
  const [archiveError, setArchiveError] = useState<{
    message: string;
    bookings: readonly ConflictingBookingDto[];
  } | null>(null);

  const typesQuery = useQuery({
    queryKey: ['admin', 'resourceTypes', false],
    queryFn: () => resourceTypeApi.listResourceTypes(false),
  });

  const listQuery = useQuery({
    queryKey: ['admin', 'resources', { q, typeId, status, page }],
    queryFn: () => api.listResources({ q, typeId, status, page }),
  });

  function invalidateList(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'resources'] });
  }

  const archiveMutation = useMutation({
    mutationFn: (resource: ResourceDto) =>
      resource.archivedAt
        ? api.unarchiveResource(resource.id, csrfToken)
        : api.archiveResource(resource.id, csrfToken),
    onSuccess: (_result, resource) => {
      showToast(
        resource.archivedAt ? 'Resource unarchived.' : 'Resource archived.',
      );
      invalidateList();
      setArchiveTarget(null);
      setArchiveError(null);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'RESOURCE_HAS_BOOKINGS') {
        const raw = error.raw as { bookings?: ConflictingBookingDto[] };
        setArchiveError({ message: error.message, bookings: raw.bookings ?? [] });
        return;
      }
      setArchiveError({
        message:
          error instanceof ApiError ? error.message : 'Something went wrong.',
        bookings: [],
      });
    },
  });

  const typeOptions = (typesQuery.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Resources
        </h1>
        <Button
          onClick={() => setCreating(true)}
          disabled={typeOptions.length === 0}
        >
          Add resource
        </Button>
      </div>
      {typeOptions.length === 0 && !typesQuery.isLoading && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Add a resource type first before creating a resource.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by name…"
          value={qInput}
          onChange={(event) => {
            setQInput(event.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={typeId ?? ''}
          onValueChange={(value) => {
            setTypeId(value || null);
            setPage(1);
          }}
          options={[{ value: '', label: 'All types' }, ...typeOptions]}
          placeholder="All types"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as ResourceStatusFilter);
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {listQuery.isLoading && <p className="mt-4 text-sm">Loading…</p>}

      {listQuery.data && listQuery.data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No resources match these filters.
        </p>
      )}

      {listQuery.data && listQuery.data.items.length > 0 && (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Capacity</th>
                <th className="py-2 font-medium">Hours</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.items.map((resource) => (
                <tr
                  key={resource.id}
                  className="border-b border-slate-100 dark:border-slate-900"
                >
                  <td className="py-2">{resource.name}</td>
                  <td className="py-2">
                    {typeOptions.find((t) => t.value === resource.typeId)?.label ??
                      '—'}
                  </td>
                  <td className="py-2">{resource.capacity}</td>
                  <td className="py-2">
                    {resource.openTime}–{resource.closeTime}
                  </td>
                  <td className="py-2">
                    {resource.archivedAt ? 'Archived' : 'Active'}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(resource)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant={resource.archivedAt ? 'secondary' : 'destructive'}
                        onClick={() => {
                          setArchiveTarget(resource);
                          setArchiveError(null);
                        }}
                      >
                        {resource.archivedAt ? 'Unarchive' : 'Archive'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              {listQuery.data.total} resource{listQuery.data.total === 1 ? '' : 's'}
            </span>
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
                disabled={page * 50 >= listQuery.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {(creating || editing) && (
        <ResourceFormDialog
          csrfToken={csrfToken}
          resource={editing}
          typeOptions={typeOptions}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            showToast(message);
            invalidateList();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {archiveTarget && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setArchiveTarget(null);
              setArchiveError(null);
            }
          }}
          title={
            archiveTarget.archivedAt ? 'Unarchive resource?' : 'Archive resource?'
          }
          description={
            archiveError ? (
              <ArchiveConflict
                message={archiveError.message}
                bookings={archiveError.bookings}
              />
            ) : archiveTarget.archivedAt ? (
              `"${archiveTarget.name}" will become bookable again.`
            ) : (
              `"${archiveTarget.name}" will no longer appear for new bookings.`
            )
          }
          confirmLabel={archiveTarget.archivedAt ? 'Unarchive' : 'Archive'}
          destructive={!archiveTarget.archivedAt}
          confirmDisabled={archiveMutation.isPending || Boolean(archiveError)}
          onConfirm={() => archiveMutation.mutate(archiveTarget)}
        />
      )}
    </div>
  );
}

function ArchiveConflict({
  message,
  bookings,
}: {
  message: string;
  bookings: readonly ConflictingBookingDto[];
}): React.JSX.Element {
  return (
    <div>
      <p>{message}</p>
      {bookings.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {bookings.map((booking) => (
            <li key={booking.bookingId}>
              {new Date(booking.startsAt).toLocaleString()} —{' '}
              {booking.memberDisplayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceFormDialog({
  csrfToken,
  resource,
  typeOptions,
  onClose,
  onSaved,
}: {
  csrfToken: string;
  resource: ResourceDto | null;
  typeOptions: readonly { value: string; label: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState(resource?.name ?? '');
  const [typeId, setTypeId] = useState(
    resource?.typeId ?? typeOptions[0]?.value ?? '',
  );
  const [description, setDescription] = useState(resource?.description ?? '');
  const [capacity, setCapacity] = useState(resource?.capacity ?? 1);
  const [openTime, setOpenTime] = useState(resource?.openTime ?? '08:00');
  const [closeTime, setCloseTime] = useState(resource?.closeTime ?? '20:00');
  const [strandedBookings, setStrandedBookings] = useState<
    readonly ConflictingBookingDto[] | null
  >(null);

  function formInput(acknowledgeStrandedBookings = false) {
    return {
      name,
      typeId,
      description,
      capacity,
      openTime,
      closeTime,
      acknowledgeStrandedBookings,
    };
  }

  const mutation = useMutation({
    mutationFn: (acknowledgeStrandedBookings: boolean) =>
      resource
        ? api.updateResource(
            resource.id,
            formInput(acknowledgeStrandedBookings),
            csrfToken,
          )
        : api.createResource(formInput(), csrfToken),
    onSuccess: () => onSaved(resource ? 'Resource updated.' : 'Resource created.'),
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.code === 'BOOKINGS_OUTSIDE_NEW_HOURS'
      ) {
        const raw = error.raw as { bookings?: ConflictingBookingDto[] };
        setStrandedBookings(raw.bookings ?? []);
      }
    },
  });

  const problems =
    mutation.error instanceof ApiError ? mutation.error.problems : undefined;
  const genericError =
    mutation.error instanceof ApiError &&
    !problems &&
    mutation.error.code !== 'BOOKINGS_OUTSIDE_NEW_HOURS'
      ? mutation.error.message
      : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={resource ? 'Edit resource' : 'Add resource'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setStrandedBookings(null);
          mutation.mutate(false);
        }}
      >
        <Label htmlFor="resource-name">Name</Label>
        <Input
          id="resource-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Label htmlFor="resource-type">Type</Label>
        <Select
          id="resource-type"
          value={typeId}
          onValueChange={setTypeId}
          options={typeOptions}
        />

        <Label htmlFor="resource-description">Description</Label>
        <Textarea
          id="resource-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <Label htmlFor="resource-capacity">Capacity</Label>
        <Input
          id="resource-capacity"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />

        <div className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="resource-open-time">Opens</Label>
            <Input
              id="resource-open-time"
              type="time"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="resource-close-time">Closes</Label>
            <Input
              id="resource-close-time"
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
          </div>
        </div>

        {strandedBookings && (
          <div
            role="alert"
            className="mt-4 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950"
          >
            <p>
              Narrowing the hours would leave {strandedBookings.length} existing
              booking
              {strandedBookings.length === 1 ? '' : 's'} outside them:
            </p>
            <ul className="mt-2 list-disc pl-5">
              {strandedBookings.map((booking) => (
                <li key={booking.bookingId}>
                  {new Date(booking.startsAt).toLocaleString()} —{' '}
                  {booking.memberDisplayName}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="destructive"
              className="mt-3"
              onClick={() => mutation.mutate(true)}
              disabled={mutation.isPending}
            >
              Save anyway
            </Button>
          </div>
        )}

        {problems && problems.length > 0 && (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
            {problems.join(' ')}
          </p>
        )}
        {genericError && (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">
            {genericError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
