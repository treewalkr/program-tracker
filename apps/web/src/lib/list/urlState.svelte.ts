import { untrack } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
  isFiltering,
  readListParams,
  writeListParams,
  type ListChange,
  type ListOptions,
  type ParamSpec,
  type ParamValues,
} from "./listParams";

/** How long the search box waits after the last keystroke before it hits the URL. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * A list's search, filters, sort, page and rows-per-page, kept in the URL
 * (DESIGN.md › Lists) so reload and back restore them. Writes replace the
 * history entry and keep focus and scroll. Create it during component init.
 *
 *   const list = listUrlState({ status: ROSTER_STATUSES, sort: ROSTER_SORTS });
 *   <input bind:value={list.search} />   // debounced into `list.q`
 *   list.set({ status: "paused" })       // resets to page 1
 */
export function listUrlState<const P extends ParamSpec>(spec: P, opts: ListOptions = {}) {
  return new ListUrlState(spec, opts);
}

export class ListUrlState<P extends ParamSpec> {
  readonly #spec: P;
  readonly #opts: ListOptions;
  readonly #state = $derived.by(() => readListParams(page.url.searchParams, this.#spec, this.#opts));
  #timer: ReturnType<typeof setTimeout> | undefined;
  #search = $state("");

  constructor(spec: P, opts: ListOptions = {}) {
    this.#spec = spec;
    this.#opts = opts;
    this.#search = untrack(() => this.#state.q);
    // Back/forward or a link changed q: mirror it into the box, unless the
    // trainer is mid-typing (a write is pending).
    $effect(() => {
      const q = this.#state.q;
      if (this.#timer === undefined) untrack(() => (this.#search = q));
    });
    $effect(() => () => clearTimeout(this.#timer));
  }

  /** Search as applied (in the URL). */
  get q() {
    return this.#state.q;
  }
  get page() {
    return this.#state.page;
  }
  get limit() {
    return this.#state.limit;
  }
  get params(): ParamValues<P> {
    return this.#state.params;
  }
  /** Search or a non-default filter narrows the list. */
  get filtering() {
    return isFiltering(this.#state, this.#spec);
  }

  /** The search box's live text; writes reach the URL after a short pause. */
  get search() {
    return this.#search;
  }
  set search(value: string) {
    this.#search = value;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (value.trim() !== this.#state.q.trim()) this.#write({ q: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Change filters/sort; the page resets to 1. */
  set(params: Partial<ParamValues<P>>) {
    this.#write({ params });
  }
  setPage(n: number) {
    this.#write({ page: n });
  }
  setLimit(n: number) {
    this.#write({ limit: n });
  }
  /** Several changes in one URL write (a change to q also resets the search box). */
  update(change: ListChange<P>) {
    if (change.q !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
      this.#search = change.q;
    }
    this.#write(change);
  }
  /** Drop search and every param not in `keep` (rows-per-page stays). */
  clear(keep: (keyof P)[] = []) {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#search = "";
    const params = {} as Record<string, string>;
    for (const [key, allowed] of Object.entries(this.#spec)) {
      if (!keep.includes(key)) params[key] = allowed ? allowed[0] : "";
    }
    this.#write({ q: "", params: params as Partial<ParamValues<P>> });
  }

  #write(change: ListChange<P>) {
    const next = writeListParams(page.url, this.#spec, change, this.#opts);
    if (next.search === page.url.search) return;
    goto(next, { replaceState: true, keepFocus: true, noScroll: true });
  }
}
