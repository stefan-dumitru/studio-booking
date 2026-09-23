import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext.js';
import { RequireAuth } from './features/auth/RequireAuth.js';
import { RegisterPage } from './features/auth/pages/RegisterPage.js';
import { CheckEmailPage } from './features/auth/pages/CheckEmailPage.js';
import { LoginPage } from './features/auth/pages/LoginPage.js';
import { VerifyEmailPage } from './features/auth/pages/VerifyEmailPage.js';
import { ForgotPasswordPage } from './features/auth/pages/ForgotPasswordPage.js';
import { ResetPasswordPage } from './features/auth/pages/ResetPasswordPage.js';
import { HomePage } from './features/home/HomePage.js';

// staleTime: 0 by default for anything not explicitly configured otherwise --
// performance.md > Constraints rules out a general client cache for this app.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 0, retry: false } },
});

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/check-email" element={<CheckEmailPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Dual purpose: with ?token= consumes the link, without it is
                the pending-member gate (ui-guidelines.md > Information
                Architecture). Reachable whether logged in or not. */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
