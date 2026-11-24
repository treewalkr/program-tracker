import { browser } from "$app/environment";
import { localDateOf, type DisplayUnits, type PortalProgressDto, type PortalWeekDto } from "@pt/shared";
import { apiMode } from "./index";
import { client } from "./treaty";
import { apiFailure } from "./errors";
import { mockPortalApi } from "./mock/portal";
import { portalWire } from "./portalWire";
import { splitLang, withLang } from "../portal/lang";
import {
  PORTAL_LOGIN,
  PortalDuplicateError,
  isPortalPublic,
  type PortalApi,
  type PortalLinkInfo,
  type PortalSavedLog,
} from "./portalTypes";

export * from "./portalTypes";

/**
 * The client portal's API seam. Live: Eden over `/v1/portal/*`, with its own
 * `pt_client` cookie — a 401 goes to /me/login, never the trainer's /login.
 * Mock: the demo client over the trainer mock's own state, so a trainer's
 * edits show up here too and the demo needs no sign-in.
 */

/** A client signed out mid-use on a private page goes to the portal's sign-in, in the page's language. */
function toPortalLogin() {
  const { lang, path } = splitLang(window.location.pathname);
  if (isPortalPublic(path)) return;
  // the session ended mid-use: the sign-in page says so, and that their entries are kept
  const login = `${PORTAL_LOGIN}?returnTo=${encodeURIComponent(path + window.location.search)}&reason=signedOut`;
  window.location.assign(lang ? withLang(login, lang) : login);
}

async function unwrap<T>(p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null; headers?: unknown }>): Promise<T> {
  const { data, error, headers } = await p;
  if (error) {
    const value = error.value as { error?: string; existing?: unknown } | string | null;
    const code = typeof error.status === "number" ? error.status : "unknown";
    if (code === 401 && browser) toPortalLogin();
    if (code === 409 && typeof value === "object" && value?.existing) {
      throw new PortalDuplicateError(portalWire(value.existing) as PortalDuplicateError["existing"]);
    }
    throw apiFailure(error, headers as HeadersInit | undefined);
  }
  return portalWire(data) as T;
}

export const livePortalApi: PortalApi = {
  async session() {
    const { data, error } = await client.v1.portal.me.get();
    if (error) {
      if (error.status === 401) return { kind: "signedOut" };
      throw new Error(`portal session check failed: ${String(error.status)}`);
    }
    return { kind: "signedIn", me: data };
  },
  // the phone's own date: "today" and the week rollover follow the client's time zone, not the server's
  week: () => unwrap<PortalWeekDto>(client.v1.portal.week.get({ query: { today: localDateOf(Date.now()) } })),
  progress: (protocol) =>
    unwrap<PortalProgressDto>(client.v1.portal.progress.get({ query: { today: localDateOf(Date.now()), ...(protocol ? { protocol } : {}) } })),
  settings: () => unwrap<{ units: DisplayUnits }>(client.v1.portal.settings.get()),
  saveSettings: (units) => unwrap<{ units: DisplayUnits }>(client.v1.portal.settings.put({ units })),
  log: (input, opts) =>
    unwrap<PortalSavedLog>(client.v1.portal.logs.post({ ...input, today: input.today ?? localDateOf(Date.now()) }, opts?.signal ? { fetch: { signal: opts.signal } } : undefined)),
  async deleteLog(id) {
    await unwrap<unknown>(client.v1.portal.logs({ id }).delete(undefined, { query: { today: localDateOf(Date.now()) } }));
  },
  async linkInfo(token) {
    const { data, error } = await client.v1.portal.link({ token }).get();
    if (error) {
      if (error.status === 404) return null;
      throw new Error(`link check failed: ${String(error.status)}`);
    }
    return data;
  },
  async openLink(token) {
    await unwrap<unknown>(client.v1.portal.link({ token }).post());
  },
  async signOut() {
    // a failed sign-out must say so: the cookie is still there (a 401 is already signed out)
    const { error } = await client.v1.portal.logout.post();
    if (error && error.status !== 401) throw Object.assign(new Error(`sign-out failed: ${String(error.status)}`), { status: error.status });
  },
  googleHref: (returnTo) => `/v1/auth/google?as=client&returnTo=${encodeURIComponent(returnTo)}`,
};

export const portalApi: PortalApi = apiMode === "live" ? livePortalApi : mockPortalApi;
