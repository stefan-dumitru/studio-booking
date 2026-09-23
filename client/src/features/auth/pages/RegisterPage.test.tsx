import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { RegisterPage } from './RegisterPage.js';
import { mockApiRoutes, jsonResponse } from '../../../test-support/mockApi.js';
import { renderRoutes } from '../../../test-support/renderWithProviders.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRegisterPage(): void {
  renderRoutes(
    {
      '/register': <RegisterPage />,
      '/check-email': <div>Check your email screen</div>,
    },
    '/register',
  );
}

function fillForm(name: string, email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
}

describe('RegisterPage', () => {
  it('navigates to check-email on a successful registration', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/register': () =>
        jsonResponse(201, { message: 'Check your email for a verification link.' }),
    });

    renderRegisterPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());

    fillForm('Ana', 'ana@example.com', 'Correcthorse1');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email screen')).toBeInTheDocument();
    });
  });

  it('shows every validation problem the server reports', async () => {
    mockApiRoutes({
      'GET /api/auth/me': () =>
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Please log in.' }),
      'POST /api/auth/register': () =>
        jsonResponse(400, {
          code: 'VALIDATION_ERROR',
          message:
            'password must be at least 8 characters; password must contain a digit',
          problems: [
            'password must be at least 8 characters',
            'password must contain a digit',
          ],
        }),
    });

    renderRegisterPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());

    fillForm('Ana', 'ana@example.com', 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('at least 8 characters');
      expect(alert).toHaveTextContent('contain a digit');
    });
  });
});
