import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A small hand-rolled toast system -- the first screen that genuinely needs
 * one, per ui-guidelines.md > Feedback & Error States: "Toast for success...
 * top-right on desktop, top-centre on mobile, 5 seconds, dismissible."
 * Phase 1's forms signalled success by navigating away instead.
 */

interface ToastItem {
  readonly id: string;
  readonly message: string;
}

interface ToastContextValue {
  showToast(message: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current, { id, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2
          sm:left-auto sm:right-4 sm:translate-x-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="flex items-center gap-3 rounded-md bg-slate-900 px-4 py-2 text-sm text-white
              shadow-lg dark:bg-slate-100 dark:text-slate-900"
          >
            {toast.message}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="text-white/70 hover:text-white dark:text-slate-900/70 dark:hover:text-slate-900"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
