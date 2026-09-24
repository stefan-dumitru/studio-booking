import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient.js';

interface AdminSummary {
  readonly todayBookingCount: number;
  readonly archivedResourceCount: number;
  readonly pendingVerificationCount: number;
}

function getSummary(): Promise<AdminSummary> {
  return apiFetch('/admin/summary', { method: 'GET' });
}

/**
 * The /admin landing view -- functional.md > User Roles: "an admin landing
 * view showing today's booking count, the count of resources currently
 * archived, and the count of members awaiting verification." Deliberately
 * minimal, per that same line -- no charts, no history, three numbers.
 */
export function SummaryPage(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: getSummary,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Summary</h1>

      {isLoading && <p className="mt-4 text-sm">Loading…</p>}

      {data && (
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Bookings today" value={data.todayBookingCount} />
          <Stat label="Archived resources" value={data.archivedResourceCount} />
          <Stat label="Members awaiting verification" value={data.pendingVerificationCount} />
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}
