import { client } from "./treaty";
import { splitLang, withLang } from "../portal/lang";

export interface SessionTrainer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** The platform admin — sees the trainer accounts console. */
  isAdmin: boolean;
}

/** Why a view as a trainer stopped applying (it stays on the session until Stop clears it). */
export type ViewEnded = "expired" | "flag_off" | "disabled";

/** The admin behind a "view as trainer": who is really looking, at whom, until when. */
export interface Impersonator {
  actor: { id: string; name: string; email: string; avatarUrl: string | null };
  trainer: { id: string; name: string; email: string; avatarUrl: string | null };
  ticket: { id: string; number: number; handle: string } | null;
  /** ISO; the view ends then. */
  until: string;
  /** ISO while Allow edits is on; null = read-only. */
  writesUntil: string | null;
  /** null while the view is live. */
  ended: ViewEnded | null;
}

/** Admin-only feature switches the web reads off the session. */
export interface SessionFlags {
  impersonation: boolean;
}

/** `signedOut` = the API answered 401; `open` = auth is off server-side (AUTH_DISABLED). */
export type Session =
  | { kind: "signedIn"; trainer: SessionTrainer; impersonator?: Impersonator | null; flags?: SessionFlags }
  | { kind: "signedOut" }
  | { kind: "open" };

/** The error text an Eden error carries (`{ error }` bodies), else a status line. */
function errorText(error: { value: unknown; status?: unknown }): string {
  const value = error.value as { error?: string } | string | null;
  const message = typeof value === "string" ? value : value?.error;
  return message ?? `request failed: ${String(error.status ?? "unknown")}`;
}

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
    return data.trainer
      ? { kind: "signedIn", trainer: data.trainer, impersonator: data.impersonator, flags: data.flags }
      : { kind: "open" };
  },
  /** End a view as a trainer; where to go next (the ticket, else the admin console). */
  async stopViewing(): Promise<string> {
    const { data, error } = await client.v1.auth.impersonate.stop.post();
    if (error) throw new Error(errorText(error));
    return data.returnTo;
  },
  /** Allow edits during a view; `confirm` is the trainer's first name. Returns when edits switch off (ISO). */
  async allowEdits(confirm: string): Promise<string> {
    const { data, error } = await client.v1.auth.impersonate["allow-edits"].post({ confirm });
    if (error) throw new Error(errorText(error));
    return data.writesUntil;
  },
  async lockEdits(): Promise<void> {
    const { error } = await client.v1.auth.impersonate.lock.post();
    if (error) throw new Error(errorText(error));
  },
  async signOut(): Promise<void> {
    await client.v1.auth.logout.post();
  },
  signInHref: (returnTo = "/") => `/v1/auth/google?returnTo=${encodeURIComponent(returnTo)}`,
};

/** Only same-app paths — never `//evil.com` or absolute URLs. */
export const safeReturnTo = (v: string | null | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/** A hash worth carrying through sign-in: an in-page anchor like `#FB-042`, nothing else. */
const ANCHOR = /^#[\w-]{1,64}$/;

/**
 * The hash of the page being left. `load`'s URL refuses to show its hash, so
 * on a first load it comes from the address bar — when that is the same page,
 * maybe still without its language prefix (`/feedback#FB-042` → `/en/feedback`).
 */
function anchorOf(from: URL): string {
  let hash = "";
  try {
    hash = from.hash;
  } catch {
    // SvelteKit's load URL throws on .hash
  }
  if (!hash && typeof window !== "undefined") {
    const here = window.location;
    const same = splitLang(here.pathname).path + here.search === splitLang(from.pathname).path + from.search;
    if (same) hash = here.hash;
  }
  return ANCHOR.test(hash) ? hash : "";
}

/**
 * Send the browser to /login in the page's language, remembering where it
 * was: `returnTo` is the unprefixed path (and its `#anchor`, so an emailed
 * ticket link survives sign-in), prefixed again on the way back.
 */
export function toLogin(from: URL): string {
  const { lang, path } = splitLang(from.pathname);
  const back = path + from.search;
  const login =
    back === "/" || back.startsWith("/login")
      ? "/login"
      : `/login?returnTo=${encodeURIComponent(back + anchorOf(from))}`;
  return lang ? withLang(login, lang) : login;
}
