/**
 * A typed error a service throws for an expected business failure. Route
 * handlers catch this and respond with {code, message} (and `problems` for a
 * multi-field validation failure) -- the stable-code convention from
 * ui-guidelines.md > Feedback & Error States.
 *
 * Anything that is NOT an AppError is unexpected: it gets a generic 500 and
 * its detail goes to the server log only (CLAUDE.md > Security Baseline).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problems?: readonly string[];

  constructor(
    status: number,
    code: string,
    message: string,
    problems?: readonly string[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.problems = problems;
  }
}
