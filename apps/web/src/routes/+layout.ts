import { redirect } from "@sveltejs/kit";
import { apiMode } from "$lib/api";
import { authApi, safeReturnTo, toLogin, type Session } from "$lib/api/auth";
import { isPortalPath } from "$lib/portal/gate";
import { prefixed, rememberLang } from "$lib/portal/i18n.svelte";
import { splitLang, withLang } from "$lib/portal/lang";

export const ssr = false;
export const prerender = false;

/**
 * Every page lives under /en or /th: an unprefixed URL (an old link, an
 * emailed magic link) redirects first. Then live mode is gated on a Google
 * session; mock (demo) mode stays open.
 */
export const load = async ({ url }): Promise<{ session: Session }> => {
  const { lang, path } = splitLang(url.pathname);
  if (!lang) redirect(307, prefixed(url));
  rememberLang(lang);

  // the client portal has its own gate (routes/me/+layout.ts) and never needs a trainer
  if (isPortalPath(path)) return { session: { kind: "open" } };
  if (apiMode !== "live") return { session: { kind: "open" } };

  const session = await authApi.session();
  const onLogin = path === "/login";
  if (session.kind === "signedOut" && !onLogin) redirect(307, toLogin(url));
  if (session.kind !== "signedOut" && onLogin) redirect(307, withLang(safeReturnTo(url.searchParams.get("returnTo")), lang));
  return { session };
};
