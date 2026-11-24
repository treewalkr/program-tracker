import { redirect } from "@sveltejs/kit";
import { apiMode } from "$lib/api";
import { portalApi } from "$lib/api/portal";
import { gateSession, portalRedirect, PORTAL_SESSION_CACHE_KEY } from "$lib/portal/gate";
import { splitLang, withLang } from "$lib/portal/lang";

export const ssr = false;
export const prerender = false;

/** This phone's copy of the last signed-in session; private mode or full storage just means no copy. */
const sessionStore = {
  get: () => {
    try {
      return localStorage.getItem(PORTAL_SESSION_CACHE_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(PORTAL_SESSION_CACHE_KEY, v);
      else localStorage.removeItem(PORTAL_SESSION_CACHE_KEY);
    } catch {
      // nothing kept: an offline tap then shows the portal's own "no connection" page
    }
  },
};

/**
 * The client portal's gate: the `pt_client` session, never the trainer's. A dropped
 * connection keeps a member who was signed in on this phone going (pages fall back
 * to their offline copies); with nothing to go on, the layout says so in the
 * portal's own language and frame, never the trainer's error page.
 */
export const load = async ({ url }) => {
  const gate = await gateSession(() => portalApi.session(), sessionStore);
  if (!gate.session) return { portal: { kind: "signedOut" as const }, offline: true, unreachable: true };
  const session = gate.session;
  // the demo is always signed in; it still shows its sign-in page when asked for it
  const { lang, path } = splitLang(url.pathname);
  const to =
    apiMode === "mock" && path === "/me/login" ? null : portalRedirect(path + url.search, session, url.searchParams.get("returnTo"));
  if (to) redirect(307, lang ? withLang(to, lang) : to);
  return { portal: session, offline: gate.offline, unreachable: false };
};
