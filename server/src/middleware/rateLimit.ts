import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

/**
 * Thin factory around express-rate-limit. Thresholds are named constants,
 * visible here rather than buried in each route, so a review can see them at
 * a glance (specifications/security.md > Threat Model).
 *
 * In-memory store: correct for a single instance, and the app only runs as
 * one today. Running more than one instance multiplies the effective
 * threshold -- flagged as a known gap in operations.md > Scalability
 * Constraints, not solved here.
 *
 * These are exported as FACTORY functions rather than pre-built instances so
 * that every createAuthRouter() call (one per createApp() call) gets its own
 * counters. A singleton instance would mean every test file sharing the
 * module cache shares the same rate-limit state -- order-dependent and flaky.
 * The production app is unaffected either way: it calls createApp() exactly
 * once.
 */
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function limiterFor(windowMs: number, max: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again later.',
    },
  });
}

export const createLoginRateLimit = (): RequestHandler =>
  limiterFor(15 * MINUTE_MS, 10);
export const createRegisterRateLimit = (): RequestHandler => limiterFor(HOUR_MS, 5);
export const createResendVerificationRateLimit = (): RequestHandler =>
  limiterFor(HOUR_MS, 5);
export const createForgotPasswordRateLimit = (): RequestHandler =>
  limiterFor(HOUR_MS, 5);
export const createResetPasswordRateLimit = (): RequestHandler =>
  limiterFor(HOUR_MS, 10);
