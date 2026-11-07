import { redirect } from "@sveltejs/kit";
import { apiMode } from "$lib/api";
import { authApi, safeReturnTo, toLogin, type Session } from "$lib/api/auth";

export const ssr = false;
export const prerender = false;

/** Live mode is gated on a Google session; mock (demo) mode stays open. */
export const load = async ({ url }): Promise<{ session: Session }> => {
  if (apiMode !== "live") return { session: { kind: "open" } };

  const session = await authApi.session();
  const onLogin = url.pathname === "/login";
  if (session.kind === "signedOut" && !onLogin) redirect(307, toLogin(url));
  if (session.kind !== "signedOut" && onLogin) redirect(307, safeReturnTo(url.searchParams.get("returnTo")));
  return { session };
};
