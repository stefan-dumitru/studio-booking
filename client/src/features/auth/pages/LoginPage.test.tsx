import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { LoginPage } from './LoginPage.js';
import { mockApiRoutes, jsonResponse } from '../../../test-support/mockApi.js';
import { renderRoutes } from '../../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLoginPage(): void {
  renderRoutes({ '/login': <LoginPage />, '/': <div>Home screen</div> }, '/login');
}

function fillAndSubmit(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
}

describe('LoginPage', () => {
  it('navigates home on a successful login', async () => {
    mockApiRoutes({
      // The bootstrap /me call fires on mount (AuthProvider); unauthenticated
      // until the form submits.
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/login': () =>
        jsonResponse(200, {
          user: {
            id: '1',
            email: 'ana@example.com',
            displayName: 'Ana',
            role: 'member',
            status: 'active',
            emailVerifiedAt: '2026-01-01T00:00:00.000Z',
          },
          csrfToken: 'token-abc',
        }),
    });

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    fillAndSubmit('ana@example.com', 'Correcthorse1');

    await waitFor(() => {
      expect(screen.getByText('Home screen')).toBeInTheDocument();
    });
  });

  it('shows the generic error message on a failed login', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/login': () =>
        jsonResponse(401, {
          code: 'INVALID_CREDENTIALS',
          message: "Email or password is incorrect, or the account isn't active.",
        }),
    });

    renderLoginPage();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    fillAndSubmit('ana@example.com', 'WrongPassword1');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Email or password is incorrect, or the account isn't active.",
      );
    });
  });
});
