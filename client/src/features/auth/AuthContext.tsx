import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import * as api from './api.js';
import type { PublicUser } from './types.js';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: PublicUser; csrfToken: string };

interface AuthContextValue {
  readonly state: AuthState;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Used by pages that establish a session themselves (verify-email's auto-login). */
  setSession(user: PublicUser, csrfToken: string): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Bootstraps auth state once on load (a page reload has no in-memory state
  // to fall back on -- the session cookie is all that survives).
  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then((response) => {
        if (cancelled) return;
        setState({
          status: 'authenticated',
          user: response.user,
          csrfToken: response.csrfToken,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // The expected case is a 401 (no session) -- not an error to
        // surface, just "not logged in". Any other failure degrades to the
        // same state: without a confirmed session, the app must treat the
        // visitor as unauthenticated rather than guess.
        setState({ status: 'unauthenticated' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const result = await api.login({ email, password });
      setState({
        status: 'authenticated',
        user: result.user,
        csrfToken: result.csrfToken,
      });
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    if (state.status === 'authenticated') {
      try {
        await api.logout(state.csrfToken);
      } catch {
        // Logging out should never trap the user in a broken UI state --
        // forget the local session regardless of whether the server call
        // succeeded (e.g. it was already invalid).
      }
    }
    setState({ status: 'unauthenticated' });
  }, [state]);

  const setSession = useCallback((user: PublicUser, csrfToken: string): void => {
    setState({ status: 'authenticated', user, csrfToken });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, setSession }),
    [state, login, logout, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
