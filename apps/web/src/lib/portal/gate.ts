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

/** The last session the gate saw signed in, on this phone: a dropped connection keeps the member in. */
export const PORTAL_SESSION_CACHE_KEY = "pt:portal-session";

/** A stored session that still reads as a signed-in member; anything else → null. */
export function parseCachedSession(raw: string | null): PortalSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { kind?: unknown; me?: { client?: { id?: unknown; name?: unknown }; trainer?: { name?: unknown } } };
    const me = s?.me;
    if (s?.kind !== "signedIn" || typeof me?.client?.id !== "string" || typeof me.client.name !== "string" || typeof me.trainer?.name !== "string") return null;
    return { kind: "signedIn", me: { client: { id: me.client.id, name: me.client.name }, trainer: { name: me.trainer.name } } };
  } catch {
    return null;
  }
}

/** What the gate decided: the session, whether it came from this phone's copy, or nothing to go on. */
export type GateSession = { session: PortalSession; offline: boolean } | { session: null; offline: true };

/**
 * The gate's session check, with a dropped connection in mind. A real answer
 * (signed in, or a 401 → signed out) is remembered (or forgotten); a failed
 * check (no signal, a 5xx) falls back to the last signed-in session on this
 * phone, so a member mid-workout keeps going. Never seen signed in here → no session.
 */
export async function gateSession(
  check: () => Promise<PortalSession>,
  store: { get(): string | null; set(v: string | null): void },
): Promise<GateSession> {
  try {
    const session = await check();
    store.set(session.kind === "signedIn" ? JSON.stringify(session) : null);
    return { session, offline: false };
  } catch {
    const cached = parseCachedSession(store.get());
    return cached ? { session: cached, offline: true } : { session: null, offline: true };
  }
}
