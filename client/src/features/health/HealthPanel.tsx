import { useEffect, useState } from 'react';

/**
 * Extracted from Phase 0's App.tsx unchanged in behaviour. Genuinely useful
 * (confirms the API and database are reachable) so it becomes part of the
 * authenticated home screen for now, rather than being deleted -- it's
 * replaced by the real browse view in Phase 3, not before.
 */

type HealthState =
  { kind: 'loading' } | { kind: 'ok' } | { kind: 'degraded'; reason: string };

export function HealthPanel(): React.JSX.Element {
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
          setHealth({
            kind: 'degraded',
            reason: describeDegraded(response.status, body),
          });
        }
      } catch (error) {
        if (cancelled) return;
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
