import type { Request } from 'express';

/**
 * express-session's regenerate/save/destroy are callback-based; these
 * promisify them so services can await session mutations in sequence, which
 * matters for regenerate-then-set-userId ordering (regenerate replaces the
 * session object, so anything set before it is lost).
 */

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
