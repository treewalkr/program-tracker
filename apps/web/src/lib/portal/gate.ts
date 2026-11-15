import { PORTAL_LOGIN, isPortalPublic, type PortalSession } from "$lib/api/portalTypes";

/** Client portal routes live under /me — their own gate, never the trainer's. */
export const isPortalPath = (path: string) => path === "/me" || path.startsWith("/me/");

/**
 * Where the portal gate sends a visitor, or null to let them through:
 * signed out → the portal's sign-in (its public pages excepted); signed in
 * on the sign-in page → their week.
 */
export function portalRedirect(path: string, session: PortalSession): string | null {
  if (session.kind === "signedOut") return isPortalPublic(path) ? null : PORTAL_LOGIN;
  return path === PORTAL_LOGIN ? "/me" : null;
}
