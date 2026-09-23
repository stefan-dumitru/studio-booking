import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AuthProvider } from '../features/auth/AuthContext.js';

/**
 * Every page under test needs the same three providers a real app boot
 * gives it (App.tsx): a query client, a router, and auth context. Extracted
 * once three page test files needed the identical wiring.
 */
export function renderRoutes(
  routes: Record<string, ReactNode>,
  initialPath: string,
  options: { strict?: boolean } = {},
): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            {Object.entries(routes).map(([path, element]) => (
              <Route key={path} path={path} element={element} />
            ))}
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
}
