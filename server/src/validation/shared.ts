import { AppError } from '../errors.js';

/**
 * Hand-written request-body validation, same "collect every problem, throw
 * once" shape as config.ts's ConfigErrors. Shared across features now that a
 * third one (resources, alongside auth) needs the same pattern -- duplicating
 * the class a second time would have been the actual smell, not the lack of
 * a schema library. See the Phase 2 plan for the fuller reasoning.
 */
export class ValidationErrors {
  private readonly problems: string[] = [];

  add(field: string, problem: string): void {
    this.problems.push(`${field} ${problem}`);
  }

  get hasAny(): boolean {
    return this.problems.length > 0;
  }

  throwIfAny(): void {
    if (this.problems.length === 0) return;
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      this.problems.join('; '),
      this.problems,
    );
  }
}

// A pragmatic shape check, not full RFC 5322 validation -- the database's own
// CHECK (position('@' IN email) > 1) is the actual backstop.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches an HTML <input type="time"> value exactly (24-hour "HH:MM"), which
// is what the client sends -- Postgres accepts the same string as a TIME literal.
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readString(body: unknown, field: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

/** Returns null (not 0) when absent or not a finite number, so "missing" and
 * "zero" stay distinguishable to the caller. */
export function readNumber(body: unknown, field: string): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readBoolean(body: unknown, field: string): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const value = (body as Record<string, unknown>)[field];
  return value === true;
}
