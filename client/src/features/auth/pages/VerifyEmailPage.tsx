import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import * as api from '../api.js';
import { ApiError } from '../api.js';
import { useAuth } from '../AuthContext.js';
import {
  AuthLayout,
  ErrorBanner,
  Field,
  SuccessBanner,
  inputClassName,
  primaryButtonClassName,
} from '../AuthLayout.js';

/**
 * Dual purpose, matching ui-guidelines.md > Information Architecture's single
 * /verify-email route: with a ?token= it consumes the emailed link (and
 * auto-logs in, per Key Flows); without one, it's the gate a pending member's
 * session redirects to, offering a resend.
 */
export function VerifyEmailPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (token) return <ConsumeToken token={token} />;
  return <PendingGate />;
}

function ConsumeToken({ token }: { token: string }): React.JSX.Element {
  const { setSession } = useAuth();
  const hasCalledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () => api.verifyEmail(token),
    onSuccess: (result) => setSession(result.user, result.csrfToken),
  });

  useEffect(() => {
    // Guards against React Strict Mode's double effect invocation sending
    // this non-idempotent, single-use token twice.
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires exactly once, deliberately
  }, [token]);

  if (mutation.isSuccess) return <Navigate to="/" replace />;

  return (
    <AuthLayout title="Verifying your email">
      {mutation.isPending && (
        <p
          role="status"
          className="mt-2 text-sm text-slate-600 dark:text-slate-400"
        >
          One moment…
        </p>
      )}
      {mutation.isError && (
        <ErrorBanner
          message={
            mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Something went wrong.'
          }
        />
      )}
    </AuthLayout>
  );
}

function PendingGate(): React.JSX.Element {
  const { state } = useAuth();
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  const knownEmail = state.status === 'authenticated' ? state.user.email : null;

  const mutation = useMutation({
    mutationFn: () => api.resendVerification(knownEmail ?? email),
    onSuccess: () => setResent(true),
  });

  return (
    <AuthLayout title="Verify your email">
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {knownEmail
          ? `We sent a verification link to ${knownEmail}. Click it to continue.`
          : 'Enter your email to get a new verification link.'}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {!knownEmail && (
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
        )}
        <button
          type="submit"
          className={primaryButtonClassName}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Sending…' : 'Resend the link'}
        </button>
      </form>

      {resent && (
        <SuccessBanner message="If that email is registered, we've sent it again." />
      )}
    </AuthLayout>
  );
}
