import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../api.js';
import { ApiError } from '../api.js';
import {
  AuthLayout,
  ErrorBanner,
  Field,
  inputClassName,
  primaryButtonClassName,
} from '../AuthLayout.js';

export function ResetPasswordPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.resetPassword({ token: token ?? '', password }),
    onSuccess: () => {
      // Deliberately not auto-logged-in -- logging in fresh confirms the new
      // password actually works (specifications/services/auth.ts > resetPassword).
      navigate('/login', { replace: true });
    },
  });

  const problems =
    mutation.error instanceof ApiError ? mutation.error.problems : undefined;
  const genericError =
    mutation.error instanceof ApiError && !problems ? mutation.error.message : null;

  if (!token) {
    return (
      <AuthLayout title="Reset your password">
        <ErrorBanner message="This link is missing its token. Request a new one." />
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="New password">
          <input
            type="password"
            className={inputClassName}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        {problems && problems.length > 0 && (
          <ErrorBanner message={problems.join(' ')} />
        )}
        {genericError && <ErrorBanner message={genericError} />}

        <button
          type="submit"
          className={primaryButtonClassName}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthLayout>
  );
}
