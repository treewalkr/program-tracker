import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { MESSAGES, carriesCoachLabel, format, intlTag, type Locale, type MessageKey } from "./messages";
import { pickLang, splitLang, swapLang, withLang } from "./lang";

/**
 * The portal's language: Thai or English, read from the URL prefix (`/th/…`,
 * `/en/…`) so a shared link opens in the sender's language. `pt.portal.lang`
 * only picks the prefix for a URL that has none; a first visit from a Thai
 * browser starts in Thai. The trainer app reads the prefix but stays English.
 */

export const LANG_KEY = "pt.portal.lang";

function stored(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/** The language of the URL this visit last loaded — what unprefixed in-app links continue in. */
let urlLang: Locale | null = null;

/** Called by the root load for every prefixed URL. */
export function rememberLang(lang: Locale): void {
  urlLang = lang;
}

/** Language for an unprefixed URL: the one this visit is in, else the saved choice, the browser's, English. */
export const fallbackLang = (): Locale => urlLang ?? (browser ? pickLang(stored(), navigator.language) : "en");

/** An app path under the current language: `inLang("/me")` → `/th/me`. */
export const inLang = (path: string): string => withLang(path, fallbackLang());

/**
 * Where a navigation is headed, kept by the root layout's `beforeNavigate`:
 * `load` can't read a URL's hash, so the unprefixed redirect takes it from here.
 */
let heading: URL | null = null;
export function headingTo(url: URL | null): void {
  heading = url;
}

/** The hash of `url`, as far as anything outside `load` knows it. */
function hashOf(url: URL): string {
  const same = (u: { pathname: string; search: string }) => u.pathname === url.pathname && u.search === url.search;
  if (heading && same(heading)) return heading.hash;
  if (browser && same(window.location)) return window.location.hash; // the first page load
  return "";
}

/** The prefixed URL an unprefixed one redirects to, query and hash kept. */
export const prefixed = (url: URL): string => inLang(url.pathname + url.search + hashOf(url));

/** The page's language: its URL prefix (the redirect makes sure there is one). */
const current = (): Locale => splitLang(page.url.pathname).lang ?? fallbackLang();

/** The language the member switched to on this visit, if they did: Back keeps it. */
let picked: Locale | null = null;
export const pickedLang = (): Locale | null => picked;

export const i18n = {
  get locale(): Locale {
    return current();
  },
  /** The same page (path, query and hash) under the other prefix; also saved as this device's default. */
  set(next: Locale) {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // private mode: the URL still carries the choice
    }
    picked = next;
    if (next === current()) return;
    void goto(swapLang(page.url, next), { replaceState: true, noScroll: true, keepFocus: true });
  },
};

/** A portal string in the active language. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return format(MESSAGES[current()][key], vars);
}

/** "Coached by" + "Ploy" / "โค้ช" + "Ploy" — no label when the name already says Coach. */
export const coachParts = (name: string) => ({ by: carriesCoachLabel(name) ? "" : t("header.coachedBy"), name: name.trim() });

/**
 * `lang="en"` for Latin-script content (a coach's name, an exercise) shown on a Thai page,
 * so screen readers and line-breaking treat it as English. Undefined otherwise.
 */
export function latinLang(text: string | null | undefined): "en" | undefined {
  if (current() !== "th" || !text) return undefined;
  return /[A-Za-z]/.test(text) && !/[\u0E00-\u0E7F]/.test(text) ? "en" : undefined;
}

const dayFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag(current()), { timeZone: "UTC", ...opts });
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "Mon 17 Nov" / "จ. 17 พ.ย." */
export const fmtDay = (iso: string) => dayFmt({ weekday: "short", day: "numeric", month: "short" }).format(utc(iso));

/** "17 Nov" / "17 พ.ย." */
export const fmtShortDate = (iso: string) => dayFmt({ day: "numeric", month: "short" }).format(utc(iso));

/** ISO weekday (1 = Mon … 7 = Sun) → "Monday" / "วันจันทร์". */
export function weekdayName(isoWeekday: number, style: "long" | "short" = "long"): string {
  // 2024-01-01 was a Monday
  return dayFmt({ weekday: style }).format(utc(`2024-01-0${isoWeekday}`));
}

/** Seconds as "2 min" / "90 s" in the active language. */
export function fmtRest(seconds: number): string {
  if (seconds >= 60 && seconds % 30 === 0) {
    const min = seconds / 60;
    return t("rx.minutes", { n: Number.isInteger(min) ? min : min.toFixed(1) });
  }
  return t("rx.seconds", { n: seconds });
}
