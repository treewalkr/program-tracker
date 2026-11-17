import { initialLocale, type Locale } from "./messages";

/**
 * The language lives in the URL: every page is `/en/…` or `/th/…`, so a
 * shared link opens in the sender's language. The `reroute` hook strips the
 * prefix before route matching; these helpers read and write it. Paths without
 * a prefix are "app paths" — what routes, gates and stored tickets see.
 */

const PREFIX = /^\/(en|th)(?=\/|$)/;

/** `/th/me/log/5` → `{ lang: "th", path: "/me/log/5" }`; `/thai` has no prefix. */
export function splitLang(pathname: string): { lang: Locale | null; path: string } {
  const m = PREFIX.exec(pathname);
  if (!m) return { lang: null, path: pathname };
  return { lang: m[1] as Locale, path: pathname.slice(m[0].length) || "/" };
}

/** The pathname without its language prefix. */
export const appPath = (url: { pathname: string }): string => splitLang(url.pathname).path;

/** API and asset paths are never prefixed. */
const unprefixable = (path: string) => !path.startsWith("/") || path.startsWith("//") || /^\/v1(?:[/?#]|$)/.test(path);

/**
 * An app path (query and hash allowed) under `lang`: `withLang("/me?x=1", "th")`
 * → `/th/me?x=1`. An existing prefix is replaced; `/` becomes `/th`.
 */
export function withLang(path: string, lang: Locale): string {
  if (unprefixable(path)) return path;
  const cut = path.search(/[?#]/);
  const pathname = cut < 0 ? path : path.slice(0, cut);
  const rest = cut < 0 ? "" : path.slice(cut);
  const bare = splitLang(pathname).path;
  return `/${lang}${bare === "/" ? "" : bare}${rest}`;
}

/** The same page (path, query and hash) in another language. */
export const swapLang = (url: URL, lang: Locale): string => withLang(appPath(url) + url.search + url.hash, lang);

/** Two URLs that show the same page, whatever their language. */
export const samePage = (a: URL, b: URL): boolean =>
  a.origin === b.origin && appPath(a) === appPath(b) && a.search === b.search;

/** Language for a URL that has none: this device's saved choice, then the browser's, then English. */
export const pickLang = (stored: string | null, browserLanguage: string | undefined): Locale =>
  initialLocale(stored, browserLanguage);
