import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import { AlertDialog } from '../../components/ui/AlertDialog.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import * as api from './api.js';
import type { AdminMemberDto, AdminMemberStatusFilter } from './types.js';

const SEARCH_DEBOUNCE_MS = 300; // performance.md > Constraints

type MemberAction = 'deactivate' | 'reactivate' | 'promote' | 'demote';

interface ActionTarget {
  readonly member: AdminMemberDto;
  readonly action: MemberAction;
}

const ACTION_LABEL: Record<MemberAction, string> = {
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  promote: 'Promote to admin',
  demote: 'Demote to member',
};

function statusLabel(status: AdminMemberDto['status']): string {
  if (status === 'pending_verification') return 'Pending verification';
  if (status === 'deactivated') return 'Deactivated';
  return 'Active';
}

export function MembersPage(): React.JSX.Element {
  const { state } = useAuth();
  const csrfToken = state.status === 'authenticated' ? state.csrfToken : '';
  const currentUserId = state.status === 'authenticated' ? state.user.id : null;
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminMemberStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<ActionTarget | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qInput]);

  const listQuery = useQuery({
    queryKey: ['admin', 'members', { q, status, page }],
    queryFn: () => api.listMembers({ q, status, page }),
  });

  function invalidateList(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
  }

  const actionMutation = useMutation({
    mutationFn: ({ member, action }: ActionTarget) => {
      if (action === 'deactivate') return api.deactivateMember(member.id, csrfToken);
      if (action === 'reactivate') return api.reactivateMember(member.id, csrfToken);
      if (action === 'promote') return api.promoteMember(member.id, csrfToken);
      return api.demoteMember(member.id, csrfToken);
    },
    onSuccess: (_result, { action }) => {
      showToast(`${ACTION_LABEL[action]} succeeded.`);
      invalidateList();
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      setTarget(null);
    },
  });

  const actionError =
    actionMutation.error instanceof ApiError ? actionMutation.error.message : null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Members</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search by name or email…"
          value={qInput}
          onChange={(event) => {
            setQInput(event.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as AdminMemberStatusFilter);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'pending_verification', label: 'Pending verification' },
            { value: 'deactivated', label: 'Deactivated' },
          ]}
          placeholder="All statuses"
        />
      </div>

      {listQuery.isLoading && <p className="mt-4 text-sm">Loading…</p>}

      {listQuery.data && listQuery.data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          No members match these filters.
        </p>
      )}

      {listQuery.data && listQuery.data.items.length > 0 && (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.items.map((member) => {
                const isSelf = member.id === currentUserId;
                return (
                  <tr key={member.id} className="border-b border-slate-100 dark:border-slate-900">
                    <td className="py-2">{member.displayName}</td>
                    <td className="py-2">{member.email}</td>
                    <td className="py-2">{member.role === 'admin' ? 'Admin' : 'Member'}</td>
                    <td className="py-2">{statusLabel(member.status)}</td>
                    <td className="py-2">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex gap-2">
                          {member.status === 'deactivated' ? (
                            <Button
                              variant="secondary"
                              onClick={() => setTarget({ member, action: 'reactivate' })}
                            >
                              Reactivate
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              disabled={isSelf}
                              onClick={() => setTarget({ member, action: 'deactivate' })}
                            >
                              Deactivate
                            </Button>
                          )}
                          {member.role === 'admin' ? (
                            <Button
                              variant="secondary"
                              onClick={() => setTarget({ member, action: 'demote' })}
                            >
                              Demote
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              onClick={() => setTarget({ member, action: 'promote' })}
                            >
                              Promote
                            </Button>
                          )}
                        </div>
                        {isSelf && member.status !== 'deactivated' && (
                          <p className="text-xs text-slate-500 dark:text-slate-500">
                            You can&rsquo;t deactivate your own account.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              {listQuery.data.total} member{listQuery.data.total === 1 ? '' : 's'}
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

      {target && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setTarget(null);
              actionMutation.reset();
            }
          }}
          title={`${ACTION_LABEL[target.action]}?`}
          description={
            <>
              <strong>{target.member.displayName}</strong> ({target.member.email})
              {target.action === 'deactivate' && (
                <>
                  {' '}
                  will be logged out immediately, and their upcoming bookings will be cancelled.
                  They will not be notified.
                </>
              )}
              {target.action === 'reactivate' && ' will be able to log in again. Their cancelled bookings are not restored.'}
              {target.action === 'promote' && ' will gain full admin access.'}
              {target.action === 'demote' && ' will lose admin access.'}
              {actionError && (
                <p role="alert" className="mt-3 text-red-700 dark:text-red-400">
                  {actionError}
                </p>
              )}
            </>
          }
          confirmLabel={ACTION_LABEL[target.action]}
          destructive={target.action === 'deactivate' || target.action === 'demote'}
          confirmDisabled={actionMutation.isPending}
          onConfirm={() => actionMutation.mutate(target)}
        />
      )}
    </div>
  );
}
