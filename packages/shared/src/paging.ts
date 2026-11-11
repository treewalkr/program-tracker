/**
 * The list standard's paging contract (apps/web/DESIGN.md › Lists).
 * Server-paged endpoints and browser-paged lists share these rules, so the
 * UI is identical either way.
 */

/** Rows-per-page choices, smallest first. */
export const PAGE_LIMITS = [10, 25, 50] as const;
export type PageLimit = (typeof PAGE_LIMITS)[number];
export const DEFAULT_PAGE_LIMIT: PageLimit = 10;

/** One page of a list. `page` is 1-based. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function isPageLimit(n: number): n is PageLimit {
  return (PAGE_LIMITS as readonly number[]).includes(n);
}

/** Page count for `total` rows — never below 1, so an empty list is "page 1 of 1". */
export function pageCount(limit: number, total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, limit)));
}

/** `page` clamped into 1…pageCount (a page past the end becomes the last page). */
export function clampPage(page: number, limit: number, total: number): number {
  const n = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, n), pageCount(limit, total));
}

/**
 * 1-based row range shown on `page` — `{ from: 11, to: 19, pages: 2 }` for
 * page 2 of 19 rows at 10. `from`/`to` are 0 when the list is empty.
 * `page` is clamped first.
 */
export function pageRange(page: number, limit: number, total: number): { page: number; from: number; to: number; pages: number } {
  const pages = pageCount(limit, total);
  const p = clampPage(page, limit, total);
  if (total <= 0) return { page: 1, from: 0, to: 0, pages };
  const from = (p - 1) * limit + 1;
  return { page: p, from, to: Math.min(total, from + limit - 1), pages };
}

/** The slice of `rows` shown on `page` (browser-side paging). */
export function pageOf<T>(rows: readonly T[], page: number, limit: number): Page<T> {
  const { page: p } = pageRange(page, limit, rows.length);
  return { items: rows.slice((p - 1) * limit, p * limit), total: rows.length, page: p, limit };
}

/** Client roster filters and sorts (GET /v1/clients/roster). */
export const ROSTER_STATUSES = ["all", "active", "paused", "archived"] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];
export const ROSTER_SORTS = ["name", "last", "recent"] as const;
export type RosterSort = (typeof ROSTER_SORTS)[number];
