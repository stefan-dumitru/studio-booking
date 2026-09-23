import type { ReactNode } from 'react';

/**
 * The shared shell every auth screen sits in. Extracted once six pages
 * (register, check-email, login, verify-email, forgot-password,
 * reset-password) needed the same centred-card layout.
 */
export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

/** Inline error banner -- ui-guidelines.md > Feedback & Error States. */
export function ErrorBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <p
      role="alert"
      className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </p>
  );
}

/** A short-lived confirmation, per the same Feedback & Error States convention. */
export function SuccessBanner({ message }: { message: string }): React.JSX.Element {
  return (
    <p
      role="status"
      className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
    >
      {message}
    </p>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <label className="mt-4 block text-sm">
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export const inputClassName =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm ' +
  'text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const primaryButtonClassName =
  'mt-6 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white ' +
  'disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900';
