import { PORTAL_LOGIN, isPortalPublic, type PortalSession } from "$lib/api/portalTypes";

/** Client portal routes live under /me — their own gate, never the trainer's. */
export const isPortalPath = (path: string) => path === "/me" || path.startsWith("/me/");

/** Where a client goes after signing in: the portal page they asked for, else their week. */
export const portalReturnTo = (v: string | null | undefined): string =>
  v && !v.startsWith("//") && isPortalPath(v.split(/[?#]/)[0]) ? v : "/me";

/**
 * Where the portal gate sends a visitor at `here` (path and query, no
 * language prefix), or null to let them through: signed out → the portal's
 * sign-in, remembering the page (its public pages excepted); signed in on the
 * sign-in page → the remembered page, else their week.
 */
export function portalRedirect(here: string, session: PortalSession, returnTo?: string | null): string | null {
  const path = here.split("?")[0];
  if (session.kind === "signedOut") {
    if (isPortalPublic(path)) return null;
    return path === "/me" ? PORTAL_LOGIN : `${PORTAL_LOGIN}?returnTo=${encodeURIComponent(here)}`;
  }
  return path === PORTAL_LOGIN ? portalReturnTo(returnTo) : null;
}
