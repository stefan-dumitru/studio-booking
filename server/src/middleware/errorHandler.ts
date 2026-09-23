import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors.js';

/**
 * The single place an uncaught error becomes a response. An AppError is an
 * expected business failure and gets its {code, message} as designed; anything
 * else is unexpected and gets a generic message with full detail only in the
 * server log (CLAUDE.md > Security Baseline: "generic message to the client,
 * full detail to the server log").
 *
 * Must be registered last, after every route.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    const body: { code: string; message: string; problems?: readonly string[] } = {
      code: error.code,
      message: error.message,
    };
    if (error.problems) body.problems = error.problems;
    res.status(error.status).json(body);
    return;
  }

  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled request error',
      method: req.method,
      path: req.path,
      err: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  res
    .status(500)
    .json({ code: 'INTERNAL', message: 'Something went wrong on our end.' });
};
