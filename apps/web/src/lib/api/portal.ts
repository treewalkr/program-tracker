import { browser } from "$app/environment";
import { localDateOf, type DisplayUnits, type PortalProgressDto, type PortalWeekDto } from "@pt/shared";
import { apiMode } from "./index";
import { client } from "./treaty";
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

/** A signed-out client on a private page goes to the portal's sign-in, in the page's language. */
function toPortalLogin() {
  const { lang, path } = splitLang(window.location.pathname);
  if (isPortalPublic(path)) return;
  const login = `${PORTAL_LOGIN}?returnTo=${encodeURIComponent(path + window.location.search)}`;
  window.location.assign(lang ? withLang(login, lang) : login);
}

async function unwrap<T>(p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const value = error.value as { error?: string; existing?: unknown } | string | null;
    const code = typeof error.status === "number" ? error.status : "unknown";
    if (code === 401 && browser) toPortalLogin();
    if (code === 409 && typeof value === "object" && value?.existing) {
      throw new PortalDuplicateError(portalWire(value.existing) as PortalDuplicateError["existing"]);
    }
    const message = typeof value === "string" ? value : value?.error;
    throw Object.assign(new Error(message ?? `request failed: ${code}`), { status: code });
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
  log: (input) => unwrap<PortalSavedLog>(client.v1.portal.logs.post({ ...input, today: input.today ?? localDateOf(Date.now()) })),
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
    await client.v1.portal.logout.post();
  },
  googleHref: (returnTo) => `/v1/auth/google?as=client&returnTo=${encodeURIComponent(returnTo)}`,
};

export const portalApi: PortalApi = apiMode === "live" ? livePortalApi : mockPortalApi;
