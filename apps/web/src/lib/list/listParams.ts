import { DEFAULT_PAGE_LIMIT, PAGE_LIMITS } from "@pt/shared";

/**
 * A list's URL parameters besides q/page/limit. Each key lists its allowed
 * values (the first is the default and stays out of the URL), or is `null`
 * for a free value whose default is "" (e.g. a trainer id).
 */
export type ParamSpec = Record<string, readonly string[] | null>;
export type ParamValues<P extends ParamSpec> = {
  [K in keyof P]: P[K] extends readonly (infer V)[] ? V : string;
};

export interface ListParams<P extends ParamSpec> {
  q: string;
  /** 1-based; unclamped — the list clamps against its total. */
  page: number;
  limit: number;
  params: ParamValues<P>;
}

export interface ListOptions {
  limits?: readonly number[];
  defaultLimit?: number;
}

const defaultOf = (allowed: readonly string[] | null) => (allowed ? allowed[0] : "");

/** The list state in `search`, falling back to defaults for missing or unknown values. */
export function readListParams<P extends ParamSpec>(search: URLSearchParams, spec: P, opts: ListOptions = {}): ListParams<P> {
  const limits = opts.limits ?? PAGE_LIMITS;
  const limitNum = Number(search.get("limit"));
  const pageNum = Number(search.get("page"));
  const params = {} as Record<string, string>;
  for (const [key, allowed] of Object.entries(spec)) {
    const v = search.get(key) ?? "";
    params[key] = allowed ? (allowed.includes(v) ? v : allowed[0]) : v;
  }
  return {
    q: search.get("q") ?? "",
    page: Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1,
    limit: limits.includes(limitNum) ? limitNum : (opts.defaultLimit ?? DEFAULT_PAGE_LIMIT),
    params: params as ParamValues<P>,
  };
}

export type ListChange<P extends ParamSpec> = Partial<Omit<ListParams<P>, "params">> & { params?: Partial<ParamValues<P>> };

/**
 * `url` with `change` applied. Defaults are dropped from the URL; changing
 * q, the limit or any param resets the page to 1 unless `change.page` is given.
 * Other query params (e.g. `?demo`) are kept.
 */
export function writeListParams<P extends ParamSpec>(url: URL, spec: P, change: ListChange<P>, opts: ListOptions = {}): URL {
  const next = new URL(url);
  const sp = next.searchParams;
  const put = (key: string, value: string, fallback: string) => {
    if (value === fallback || value === "") sp.delete(key);
    else sp.set(key, value);
  };
  if (change.q !== undefined) put("q", change.q.trim() === "" ? "" : change.q, "");
  if (change.limit !== undefined) put("limit", String(change.limit), String(opts.defaultLimit ?? DEFAULT_PAGE_LIMIT));
  for (const [key, value] of Object.entries(change.params ?? {})) {
    if (key in spec && value !== undefined) put(key, value as string, defaultOf(spec[key]));
  }
  const resets = change.q !== undefined || change.limit !== undefined || Object.keys(change.params ?? {}).length > 0;
  if (change.page !== undefined) put("page", String(change.page), "1");
  else if (resets) sp.delete("page");
  return next;
}

/** Whether search or any param narrows the list (limit and page don't). */
export function isFiltering<P extends ParamSpec>(state: ListParams<P>, spec: P): boolean {
  return (
    state.q.trim() !== "" ||
    Object.entries(spec).some(([key, allowed]) => (state.params as Record<string, string>)[key] !== defaultOf(allowed))
  );
}
