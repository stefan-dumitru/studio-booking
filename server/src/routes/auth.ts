import { Router } from 'express';
import type { AuthDeps } from '../services/auth.js';
import * as authService from '../services/auth.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireCsrf, issueCsrfToken } from '../middleware/csrf.js';
import { saveSession } from '../middleware/sessionUtil.js';
import {
  createLoginRateLimit,
  createRegisterRateLimit,
  createResendVerificationRateLimit,
  createForgotPasswordRateLimit,
  createResetPasswordRateLimit,
} from '../middleware/rateLimit.js';
import {
  validateEmailBody,
  validateLoginBody,
  validateRegisterBody,
  validateResetPasswordBody,
  validateTokenBody,
} from '../validation.js';
import { toPublicUser } from '../db/types.js';

const GENERIC_ACCOUNT_MESSAGE =
  "If that email is registered, we've sent instructions to it.";

/**
 * Mounted at /api/auth. Every handler is async and forwards to next(error) on
 * throw, so AppError and unexpected errors both reach the single
 * errorHandler (server/src/middleware/errorHandler.ts) instead of each route
 * needing its own try/catch.
 */
export function createAuthRouter(deps: AuthDeps, auth: AuthMiddleware): Router {
  const router = Router();

  // Fresh limiter instances per router -- see rateLimit.ts's doc comment.
  const registerRateLimit = createRegisterRateLimit();
  const resendVerificationRateLimit = createResendVerificationRateLimit();
  const loginRateLimit = createLoginRateLimit();
  const forgotPasswordRateLimit = createForgotPasswordRateLimit();
  const resetPasswordRateLimit = createResetPasswordRateLimit();

  router.post('/register', registerRateLimit, (req, res, next) => {
    void (async () => {
      const input = validateRegisterBody(req.body);
      await authService.register(deps, input);
      res.status(201).json({
        message: 'Check your email for a verification link.',
      });
    })().catch(next);
  });

  router.post(
    '/resend-verification',
    resendVerificationRateLimit,
    (req, res, next) => {
      void (async () => {
        const { email } = validateEmailBody(req.body);
        await authService.resendVerification(deps, email);
        res.status(200).json({ message: GENERIC_ACCOUNT_MESSAGE });
      })().catch(next);
    },
  );

  router.post('/verify-email', (req, res, next) => {
    void (async () => {
      const { token } = validateTokenBody(req.body);
      const result = await authService.verifyEmail(deps, req, token);
      res.status(200).json(result);
    })().catch(next);
  });

  router.post('/login', loginRateLimit, (req, res, next) => {
    void (async () => {
      const input = validateLoginBody(req.body);
      const result = await authService.login(deps, req, input);
      res.status(200).json(result);
    })().catch(next);
  });

  router.post('/logout', auth.requireAuth, requireCsrf, (req, res, next) => {
    void (async () => {
      await authService.logout(deps, req);
      res.status(200).json({ message: 'Logged out.' });
    })().catch(next);
  });

  router.get('/me', auth.requireAuth, (req, res, next) => {
    void (async () => {
      // requireAuth guarantees req.currentUser is set. The client only learns
      // the CSRF token from login/verify-email's response body, so a page
      // reload (which bootstraps via this endpoint, not those) needs it
      // returned here too -- it's already sitting in the session, just not
      // yet handed back. A session created before this lazily gets one now
      // rather than being unable to ever make a mutating request again.
      if (!req.session.csrfToken) {
        req.session.csrfToken = issueCsrfToken();
        await saveSession(req);
      }
      res.status(200).json({
        user: toPublicUser(req.currentUser!),
        csrfToken: req.session.csrfToken,
      });
    })().catch(next);
  });

  router.post('/forgot-password', forgotPasswordRateLimit, (req, res, next) => {
    void (async () => {
      const { email } = validateEmailBody(req.body);
      await authService.forgotPassword(deps, email);
      res.status(200).json({ message: GENERIC_ACCOUNT_MESSAGE });
    })().catch(next);
  });

  router.post('/reset-password', resetPasswordRateLimit, (req, res, next) => {
    void (async () => {
      const input = validateResetPasswordBody(req.body);
      await authService.resetPassword(deps, input);
      res
        .status(200)
        .json({ message: 'Your password has been reset. Please log in.' });
    })().catch(next);
  });

  return router;
}
