interface PgErrorShape {
  readonly code?: string;
  readonly constraint?: string;
}

/** Postgres error code 23505 -- a UNIQUE or PRIMARY KEY violation. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = error as PgErrorShape;
  if (pgError?.code !== '23505') return false;
  return constraint ? pgError.constraint === constraint : true;
}
