import { TIME_PATTERN, ValidationErrors } from './shared.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface AvailabilityQuery {
  readonly date: string;
  readonly typeIds: readonly string[] | null;
  readonly from: string | null;
  readonly to: string | null;
}

function parseStringParam(query: unknown, key: string): string {
  if (typeof query !== 'object' || query === null) return '';
  const value = (query as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function validateAvailabilityQuery(query: unknown): AvailabilityQuery {
  const errors = new ValidationErrors();

  const date = parseStringParam(query, 'date');
  if (!DATE_PATTERN.test(date)) {
    errors.add('date', 'must be in YYYY-MM-DD form');
  } else if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    errors.add('date', 'is not a real calendar date');
  }

  const typeIdsRaw = parseStringParam(query, 'typeIds');
  const typeIds = typeIdsRaw
    ? typeIdsRaw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : null;

  const fromRaw = parseStringParam(query, 'from');
  const from = fromRaw || null;
  if (from && !TIME_PATTERN.test(from)) {
    errors.add('from', 'must be a 24-hour time in HH:MM form');
  }

  const toRaw = parseStringParam(query, 'to');
  const to = toRaw || null;
  if (to && !TIME_PATTERN.test(to)) {
    errors.add('to', 'must be a 24-hour time in HH:MM form');
  }

  if (
    from &&
    to &&
    TIME_PATTERN.test(from) &&
    TIME_PATTERN.test(to) &&
    to <= from
  ) {
    errors.add('to', 'must be after from');
  }

  errors.throwIfAny();
  return { date, typeIds, from, to };
}
