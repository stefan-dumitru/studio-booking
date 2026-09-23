import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../api.js';
import { ApiError } from '../api.js';
import {
  AuthLayout,
  ErrorBanner,
  Field,
  inputClassName,
  primaryButtonClassName,
} from '../AuthLayout.js';

export function RegisterPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.register({ email, displayName, password }),
    onSuccess: () => {
      navigate('/check-email', { state: { email } });
    },
  });

  const problems =
    mutation.error instanceof ApiError ? mutation.error.problems : undefined;
  const genericError =
    mutation.error instanceof ApiError && !problems ? mutation.error.message : null;

  return (
    <AuthLayout title="Create an account">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Name">
          <input
            className={inputClassName}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            required
          />
        </Field>
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
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
