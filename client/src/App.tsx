import { useEffect, useState } from 'react';
import { STUDIO_TIME_ZONE } from '@studio/shared';

/**
 * Phase 0 only: proves the client can reach the API and that the API can reach
 * the database. Replaced by the browse-availability screen in Phase 3.
 */

type HealthState =
  { kind: 'loading' } | { kind: 'ok' } | { kind: 'degraded'; reason: string };

export function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const response = await fetch('/api/health');
        const body: unknown = await response.json();
        if (cancelled) return;

        if (response.ok) {
          setHealth({ kind: 'ok' });
        } else {
          // A 503 is the documented database-unreachable case, not a crash.
          setHealth({
            kind: 'degraded',
            reason: describeDegraded(response.status, body),
          });
        }
      } catch (error) {
        if (cancelled) return;
        // fetch only rejects on a network-level failure, which here means the
        // API server itself is not running.
        setHealth({
          kind: 'degraded',
          reason:
            error instanceof Error
              ? `Could not reach the API (${error.message})`
              : 'Could not reach the API',
        });
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-dvh bg-white px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold">Studio Booking</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Phase 0 — skeleton and schema. Times are shown in {STUDIO_TIME_ZONE}.
        </p>

        <section
          aria-labelledby="health-heading"
          className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 id="health-heading" className="text-sm font-medium">
            API health
          </h2>
          {/* Status is announced, not only coloured -- ui-guidelines.md > Accessibility. */}
          <p role="status" className="mt-2 text-sm">
            {health.kind === 'loading' && 'Checking…'}
            {health.kind === 'ok' &&
              'OK — the API is up and the database is reachable.'}
            {health.kind === 'degraded' && `Degraded — ${health.reason}`}
          </p>
        </section>
      </div>
    </main>
  );
}

function describeDegraded(status: number, body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'db' in body &&
    (body as { db?: unknown }).db === 'unreachable'
  ) {
    return 'the API is up but cannot reach the database.';
  }
  return `the API responded with status ${status}.`;
}
