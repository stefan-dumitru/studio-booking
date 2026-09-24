import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { AlertDialog } from '../../components/ui/AlertDialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input, Label } from '../../components/ui/Input.js';
import * as api from './api.js';
import type { ResourceTypeDto } from './types.js';

export function ResourceTypesPage(): React.JSX.Element {
  const { state } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<ResourceTypeDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ResourceTypeDto | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin', 'resourceTypes', includeArchived],
    queryFn: () => api.listResourceTypes(includeArchived),
  });

  function invalidateList(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'resourceTypes'] });
    // A resource's own list shows the type name/archived state too.
    void queryClient.invalidateQueries({ queryKey: ['admin', 'resources'] });
  }

  const archiveMutation = useMutation({
    mutationFn: (type: ResourceTypeDto) =>
      type.archivedAt
        ? api.unarchiveResourceType(type.id, csrfToken)
        : api.archiveResourceType(type.id, csrfToken),
    onSuccess: (_result, type) => {
      showToast(
        type.archivedAt ? 'Resource type unarchived.' : 'Resource type archived.',
      );
      invalidateList();
      setArchiveTarget(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Resource types
        </h1>
        <Button onClick={() => setCreating(true)}>Add type</Button>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
        />
        Show archived
      </label>

      {listQuery.isLoading && <p className="mt-4 text-sm">Loading…</p>}

      {listQuery.data && listQuery.data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No resource types yet. Add one to get started.
        </p>
      )}

      {listQuery.data && listQuery.data.items.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Sort order</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.data.items.map((type) => (
              <tr
                key={type.id}
                className="border-b border-slate-100 dark:border-slate-900"
              >
                <td className="py-2">{type.name}</td>
                <td className="py-2">{type.sortOrder}</td>
                <td className="py-2">{type.archivedAt ? 'Archived' : 'Active'}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setEditing(type)}>
                      Edit
                    </Button>
                    <Button
                      variant={type.archivedAt ? 'secondary' : 'destructive'}
                      onClick={() => setArchiveTarget(type)}
                    >
                      {type.archivedAt ? 'Unarchive' : 'Archive'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <ResourceTypeFormDialog
          csrfToken={csrfToken}
          resourceType={editing}
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
              archiveMutation.reset();
            }
          }}
          title={
            archiveTarget.archivedAt
              ? 'Unarchive resource type?'
              : 'Archive resource type?'
          }
          description={
            // Rendered *inside* the dialog rather than below it: while the
            // dialog is open, Radix marks everything outside it aria-hidden,
            // so an error placed outside would be invisible to a screen
            // reader (and visually sits behind the overlay either way).
            archiveMutation.isError && archiveMutation.error instanceof ApiError
              ? archiveMutation.error.message
              : archiveTarget.archivedAt
                ? `"${archiveTarget.name}" will become available for new resources again.`
                : `"${archiveTarget.name}" will no longer be selectable for new or edited resources.`
          }
          confirmLabel={archiveTarget.archivedAt ? 'Unarchive' : 'Archive'}
          destructive={!archiveTarget.archivedAt}
          confirmDisabled={archiveMutation.isPending || archiveMutation.isError}
          onConfirm={() => archiveMutation.mutate(archiveTarget)}
        />
      )}
    </div>
  );
}

function ResourceTypeFormDialog({
  csrfToken,
  resourceType,
  onClose,
  onSaved,
}: {
  csrfToken: string;
  resourceType: ResourceTypeDto | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}): React.JSX.Element {
  const [name, setName] = useState(resourceType?.name ?? '');
  const [sortOrder, setSortOrder] = useState(resourceType?.sortOrder ?? 0);

  const mutation = useMutation({
    mutationFn: () =>
      resourceType
        ? api.updateResourceType(resourceType.id, { name, sortOrder }, csrfToken)
        : api.createResourceType({ name, sortOrder }, csrfToken),
    onSuccess: () =>
      onSaved(resourceType ? 'Resource type updated.' : 'Resource type created.'),
  });

  const problems =
    mutation.error instanceof ApiError ? mutation.error.problems : undefined;
  const genericError =
    mutation.error instanceof ApiError && !problems ? mutation.error.message : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={resourceType ? 'Edit resource type' : 'Add resource type'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Label htmlFor="resource-type-name">Name</Label>
        <Input
          id="resource-type-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <Label htmlFor="resource-type-sort-order">Sort order</Label>
        <Input
          id="resource-type-sort-order"
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
        />

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
