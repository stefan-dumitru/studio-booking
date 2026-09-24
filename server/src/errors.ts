/**
 * A typed error a service throws for an expected business failure. Route
 * handlers catch this and respond with {code, message} (and `problems` for a
 * multi-field validation failure, or `detail` for structured payload like the
 * conflicting bookings on an archive block) -- the stable-code convention
 * from ui-guidelines.md > Feedback & Error States.
 *
 * Anything that is NOT an AppError is unexpected: it gets a generic 500 and
 * its detail goes to the server log only (CLAUDE.md > Security Baseline).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems?: readonly string[];
  /** Extra structured data a specific error carries, e.g. the list of
   * bookings blocking an archive. Spread into the response body alongside
   * code/message -- see server/src/middleware/errorHandler.ts. */
  readonly detail?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    problems?: readonly string[],
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.problems = problems;
    this.detail = detail;
  }
}
