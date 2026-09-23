import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as api from '../api.js';
import {
  AuthLayout,
  Field,
  SuccessBanner,
  inputClassName,
  primaryButtonClassName,
} from '../AuthLayout.js';

export function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.forgotPassword(email),
  });

  return (
    <AuthLayout title="Reset your password">
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

        <button
          type="submit"
          className={primaryButtonClassName}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      {/* Same response whether or not the email exists -- security.md >
          Authentication -- so this shows regardless of what actually happened. */}
      {mutation.isSuccess && (
        <SuccessBanner message="If that email is registered, we've sent a reset link to it." />
      )}

      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        <Link to="/login" className="font-medium underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
