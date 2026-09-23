import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import * as api from '../api.js';
import {
  AuthLayout,
  SuccessBanner,
  primaryButtonClassName,
} from '../AuthLayout.js';

interface LocationState {
  readonly email?: string;
}

/**
 * Reached right after registration (ui-guidelines.md > Key Flows). The
 * address comes from router state set by RegisterPage; a direct visit (no
 * state) still renders something useful rather than crashing on `undefined`.
 */
export function CheckEmailPage(): React.JSX.Element {
  const location = useLocation();
  const email = (location.state as LocationState | null)?.email ?? null;
  const [resent, setResent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.resendVerification(email ?? ''),
    onSuccess: () => setResent(true),
  });

  return (
    <AuthLayout title="Check your email">
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {email
          ? `We've sent a verification link to ${email}.`
          : "We've sent a verification link to your email address."}{' '}
        Click it to activate your account.
      </p>

      {email && (
        <button
          type="button"
          className={primaryButtonClassName}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Sending…' : 'Resend the link'}
        </button>
      )}

      {resent && (
        <SuccessBanner message="If that email is registered, we've sent it again." />
      )}
    </AuthLayout>
  );
}
