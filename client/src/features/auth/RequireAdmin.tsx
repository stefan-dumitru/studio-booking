import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

/**
 * Mirrors RequireAuth.tsx but for the admin surface: unauthenticated -> login,
 * pending -> verify-email, an active non-admin member -> home (the Admin
 * entry is simply not rendered for a member -- ui-guidelines.md >
 * Information Architecture). Presentation only; the server enforces the same
 * rule independently via requireAdmin (security.md > Authorization).
 */
export function RequireAdmin(): React.JSX.Element {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-sm"
      >
        Loading…
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (state.user.status === 'pending_verification') {
    return <Navigate to="/verify-email" replace />;
  }

  if (state.user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
