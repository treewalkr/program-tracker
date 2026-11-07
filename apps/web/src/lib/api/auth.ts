import { client } from "./treaty";

export interface SessionTrainer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** The platform admin — sees the trainer accounts console. */
  isAdmin: boolean;
}

/** `signedOut` = the API answered 401; `open` = auth is off server-side (AUTH_DISABLED). */
export type Session = { kind: "signedIn"; trainer: SessionTrainer } | { kind: "signedOut" } | { kind: "open" };

/**
 * Trainer session over Eden. Sign-in itself is a full-page navigation to
 * /v1/auth/google (an OAuth redirect), so it has no client call.
 */
export const authApi = {
  async session(): Promise<Session> {
    const { data, error } = await client.v1.auth.me.get();
    if (error) {
      if (error.status === 401) return { kind: "signedOut" };
      throw new Error(`session check failed: ${String(error.status)}`);
    }
    return data.trainer ? { kind: "signedIn", trainer: data.trainer } : { kind: "open" };
  },
  async signOut(): Promise<void> {
    await client.v1.auth.logout.post();
  },
  signInHref: (returnTo = "/") => `/v1/auth/google?returnTo=${encodeURIComponent(returnTo)}`,
};

/** Only same-app paths — never `//evil.com` or absolute URLs. */
export const safeReturnTo = (v: string | null | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/** Send the browser to /login, remembering where it was. */
export function toLogin(from: URL): string {
  const back = from.pathname + from.search;
  return back === "/" || back.startsWith("/login") ? "/login" : `/login?returnTo=${encodeURIComponent(back)}`;
}
