import { goto } from "$app/navigation";
import type { AfterNavigate } from "@sveltejs/kit";
import { appPath, splitLang, withLang } from "$lib/portal/lang";

/**
 * Back for the home-screen app, which has no browser toolbar: return to the
 * page the user came from, else go to the page's parent.
 */

/** Sign-in pages: Back never lands on one. */
const isAuth = (path: string) => path === "/login" || path === "/me/login" || path.startsWith("/me/link/");

const pathOf = (url: string) => appPath(new URL(url, "http://app.local"));

/**
 * Steps back (negative) to the nearest earlier history entry showing another
 * page. Entries for this page (hash or query changes, the language prefix
 * aside) are skipped. `null` when there is none, or it's a sign-in page.
 */
export function backDelta(entries: readonly (string | null)[], index: number, here: string): number | null {
  for (let i = Math.min(index, entries.length) - 1; i >= 0; i--) {
    const url = entries[i];
    if (url == null) return null;
    const path = pathOf(url);
    if (path === here) continue;
    return isAuth(path) ? null : i - index;
  }
  return null;
}

/**
 * History as this visit has seen it, for browsers without the Navigation API:
 * the URLs of the entries SvelteKit navigated through, and where we are.
 */
let seen: string[] = [];
let at = 0;

/**
 * Whether this page has an earlier page to go back to. The layout shows its
 * own `‹ Back` from it on pages without crumbs (a menu page reached from a
 * link inside another page, like Schemes from a new program).
 */
export const backNav = $state({ can: false });

interface NavigationLike {
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

/** Steps back from `here`: the Navigation API's entries when there is one, else ours. */
function deltaFrom(here: string): number | null {
  const navigation = (globalThis as unknown as { navigation?: NavigationLike }).navigation;
  return navigation?.currentEntry
    ? backDelta(navigation.entries().map((e) => e.url), navigation.currentEntry.index, here)
    : backDelta(seen, at, here);
}

/** Called from the root layout's `afterNavigate`. */
export function trackNavigation(nav: Pick<AfterNavigate, "type" | "to" | "delta">): void {
  const url = nav.to?.url.href;
  if (!url) return;
  if (nav.type === "enter" || seen.length === 0) {
    seen = [url];
    at = 0;
  } else if (nav.type === "popstate") {
    at = Math.max(0, Math.min(seen.length - 1, at + (nav.delta ?? 0)));
    seen[at] = url;
  } else {
    seen = [...seen.slice(0, at + 1), url];
    at = seen.length - 1;
  }
  backNav.can = deltaFrom(appPath(nav.to!.url)) != null;
}

/** Go back to the previous page, or to `fallback` when there's none to go to. */
export function goBack(fallback: string): void {
  const delta = deltaFrom(appPath(window.location));
  if (delta) history.go(delta);
  else {
    const lang = splitLang(window.location.pathname).lang;
    void goto(lang ? withLang(fallback, lang) : fallback);
  }
}
