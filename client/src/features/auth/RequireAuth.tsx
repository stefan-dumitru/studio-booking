import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

/**
 * Route guard mirroring the server's requireAuth/requireVerified split
 * (ui-guidelines.md > Information Architecture): unauthenticated goes to
 * /login, pending goes to /verify-email, active renders the route.
 *
 * This is presentation only -- the server enforces the same rules
 * independently and does not trust this component (security.md > Authorization).
 */
export function RequireAuth(): React.JSX.Element {
  const { state } = useAuth();
  const location = useLocation();

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
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (state.user.status === 'pending_verification') {
    return <Navigate to="/verify-email" replace />;
  }

  return <Outlet />;
}
