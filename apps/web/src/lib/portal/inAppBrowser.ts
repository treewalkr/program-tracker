/**
 * In-app browsers: a link tapped in LINE, Messenger, Facebook or Instagram
 * opens in that app's own webview, not Safari or Chrome. Google refuses
 * sign-in there (403 `disallowed_useragent`), and the sign-in cookie lands in
 * the app's own jar, not the phone's browser. The portal spots them by user
 * agent and points the member to the phone's browser instead.
 */

export type InAppBrowser = "line" | "messenger" | "facebook" | "instagram" | "webview";

/** The in-app browser a user agent belongs to, or null for a real browser (Safari, Chrome, a Custom Tab, desktop). */
export function inAppBrowser(ua: string): InAppBrowser | null {
  if (/\bLine\//.test(ua)) return "line";
  if (/\bInstagram\b/.test(ua)) return "instagram";
  if (/FBAN\/Messenger|FB_IAB\/(?:Orca|Messenger)/.test(ua)) return "messenger";
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return "facebook";
  // Android System WebView marks itself `; wv)`; Chrome and Custom Tabs don't
  if (/;\s*wv\)/.test(ua)) return "webview";
  return null;
}

/** Which system browser to name: the phone's default is Safari on iOS, Chrome on Android. */
export const phoneBrowser = (ua: string): "Safari" | "Chrome" => (/Android/i.test(ua) ? "Chrome" : "Safari");

/** The app's own name, for copy ("inside LINE"); null for an unnamed webview. */
export const inAppName = (app: InAppBrowser): string | null =>
  app === "line" ? "LINE" : app === "messenger" ? "Messenger" : app === "facebook" ? "Facebook" : app === "instagram" ? "Instagram" : null;

/** What the copy needs to send a member to the phone's browser; null in a real browser. */
export function inAppHint(ua: string): { app: InAppBrowser; name: string | null; browser: "Safari" | "Chrome"; menu: "⋯" | "⋮" } | null {
  const app = inAppBrowser(ua);
  if (!app) return null;
  // the in-app browser's menu: ⋯ on iOS, ⋮ on Android
  return { app, name: inAppName(app), browser: phoneBrowser(ua), menu: /Android/i.test(ua) ? "⋮" : "⋯" };
}

/** LINE opens a URL carrying this in the phone's browser instead of its own (LINE URL scheme docs). */
export const EXTERNAL_BROWSER_PARAM = "openExternalBrowser";

/** `url` with `openExternalBrowser=1`, keeping its other query params and hash. */
export function withExternalBrowser(url: string): string {
  const hash = url.indexOf("#");
  const base = hash < 0 ? url : url.slice(0, hash);
  const tail = hash < 0 ? "" : url.slice(hash);
  if (new RegExp(`[?&]${EXTERNAL_BROWSER_PARAM}=`).test(base)) return url;
  return `${base}${base.includes("?") ? "&" : "?"}${EXTERNAL_BROWSER_PARAM}=1${tail}`;
}

/** The address without LINE's `openExternalBrowser` (noise once the page is open), or null when it isn't there. */
export function withoutExternalBrowser(url: URL): URL | null {
  if (!url.searchParams.has(EXTERNAL_BROWSER_PARAM)) return null;
  const clean = new URL(url);
  clean.searchParams.delete(EXTERNAL_BROWSER_PARAM);
  return clean;
}
