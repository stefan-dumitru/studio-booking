import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useAuth } from '../AuthContext.js';
import { ApiError } from '../api.js';
import {
  AuthLayout,
  ErrorBanner,
  Field,
  inputClassName,
  primaryButtonClassName,
} from '../AuthLayout.js';

interface LocationState {
  readonly from?: Location;
}

export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => {
      // Login can succeed for a pending account too (security.md >
      // Authentication) -- always send them to "/", and RequireAuth there
      // redirects a pending session to /verify-email on its own.
      const from = (location.state as LocationState | null)?.from;
      navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true });
    },
  });

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <AuthLayout title="Log in">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Email">
          <input
            type="email"
            className={inputClassName}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            className={inputClassName}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {errorMessage && <ErrorBanner message={errorMessage} />}

        <button
          type="submit"
          className={primaryButtonClassName}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-4 flex justify-between text-sm text-slate-600 dark:text-slate-400">
        <Link to="/register" className="font-medium underline">
          Create an account
        </Link>
        <Link to="/forgot-password" className="font-medium underline">
          Forgot password?
        </Link>
      </p>
    </AuthLayout>
  );
}
