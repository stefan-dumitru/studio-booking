import { STUDIO_TIME_ZONE } from '@studio/shared';
import { useAuth } from '../auth/AuthContext.js';
import { HealthPanel } from '../health/HealthPanel.js';

/**
 * The authenticated landing screen. Placeholder content until Phase 3
 * replaces it with the real browse-availability view -- only reachable by an
 * active session, since RequireAuth gates it (pending sessions never see
 * this, they're redirected to /verify-email).
 */
export function HomePage(): React.JSX.Element {
  const { state, logout } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;

  return (
    <main className="min-h-dvh bg-white px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Studio Booking</h1>
            {user && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Logged in as {user.displayName} ({user.role})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            Log out
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Browsing and booking arrive in a later phase. Times will be shown in{' '}
          {STUDIO_TIME_ZONE}.
        </p>

        <HealthPanel />
      </div>
    </main>
  );
}
