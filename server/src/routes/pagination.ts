import type { ParsedQs } from 'qs';

const DEFAULT_PAGE_SIZE = 50;

export interface PageParams {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Every list endpoint carries an explicit LIMIT (operations.md > Query
 * Efficiency: "confirm no unbounded queries"). A client-supplied pageSize is
 * clamped rather than trusted outright.
 *
 * Most admin lists default to and cap at 50 (performance.md). Availability
 * is the one exception -- 25 resources per page (ui-guidelines.md >
 * breakpoints) -- so callers may override both the default and the cap,
 * with the cap defaulting to whatever the default is.
 */
export function parsePageParams(
  query: ParsedQs,
  defaultPageSize: number = DEFAULT_PAGE_SIZE,
  maxPageSize: number = defaultPageSize,
): PageParams {
  const rawPage = Number(query['page']);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = Number(query['pageSize']);
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, maxPageSize)
      : defaultPageSize;

  return { page, pageSize };
}

export function parseStringParam(query: ParsedQs, key: string): string {
  const value = query[key];
  return typeof value === 'string' ? value : '';
}
