import { describe, expect, mock, test } from "bun:test";
import type { PortalSession } from "$lib/api/portalTypes";

// Thin stand-ins for SvelteKit and the API seam: the loads only need a mode and a session.
let portal: PortalSession = { kind: "signedOut" };
mock.module("$app/environment", () => ({ browser: false }));
mock.module("$app/state", () => ({ page: { url: new URL("https://pt.test/en") } }));
// the full surface: Bun module mocks leak across files, and later ones need beforeNavigate
mock.module("$app/navigation", () => ({ goto: async () => {}, beforeNavigate: () => {}, afterNavigate: () => {} }));
mock.module("$lib/api", () => ({ apiMode: "live" }));
// the trainer session check: signed out (401) or auth off server-side ("open")
let trainerSignedIn = true;
const me401 = { data: null, error: { status: 401 } };
const meOpen = { data: { trainer: null }, error: null };
mock.module("$lib/api/treaty", () => ({ client: { v1: { auth: { me: { get: async () => (trainerSignedIn ? meOpen : me401) } } } } }));
mock.module("$lib/api/portal", () => ({ portalApi: { session: async () => portal } }));

const root = await import("./+layout");
const me = await import("./me/+layout");

type Load = (e: { url: URL }) => Promise<unknown>;
const u = (s: string) => new URL(s, "https://pt.test");

/** Where a load redirects to, or null when it lets the page through. */
async function redirectOf(load: unknown, path: string): Promise<string | null> {
  try {
    await (load as Load)({ url: u(path) });
    return null;
  } catch (e) {
    const r = e as { status?: number; location?: string };
    if (r.status !== 307) throw e;
    return r.location ?? null;
  }
}

describe("root load: every page has a language prefix", () => {
  test("an unprefixed URL redirects, query kept", async () => {
    expect(await redirectOf(root.load, "/me/link/abc?x=1")).toBe("/en/me/link/abc?x=1");
    expect(await redirectOf(root.load, "/")).toBe("/en");
    expect(await redirectOf(root.load, "/thai")).toBe("/en/thai");
  });

  test("/th and /th/ are pages; the visit's language carries to unprefixed links", async () => {
    expect(await redirectOf(root.load, "/th/me")).toBeNull();
    expect(await redirectOf(root.load, "/th/")).toBeNull();
    expect(await redirectOf(root.load, "/th")).toBeNull();
    expect(await redirectOf(root.load, "/me/log/5")).toBe("/th/me/log/5");
  });
});

describe("trainer sign-in keeps the language", () => {
  test("signed out on /th/clients/5 → /th/login, returnTo unprefixed", async () => {
    trainerSignedIn = false;
    expect(await redirectOf(root.load, "/th/clients/5?tab=log")).toBe("/th/login?returnTo=%2Fclients%2F5%3Ftab%3Dlog");
    expect(await redirectOf(root.load, "/th/login?returnTo=%2Fclients%2F5")).toBeNull();
  });

  test("signed in on /th/login → the page under /th", async () => {
    trainerSignedIn = true;
    expect(await redirectOf(root.load, "/th/login?returnTo=%2Fclients%2F5")).toBe("/th/clients/5");
    expect(await redirectOf(root.load, "/en/login?returnTo=%2F%2Fevil.test")).toBe("/en");
  });
});

describe("portal gate keeps the language through sign-in", () => {
  test("signed out on /th/me/log/5 → /th/me/login, remembering the page", async () => {
    portal = { kind: "signedOut" };
    expect(await redirectOf(me.load, "/th/me/log/5")).toBe("/th/me/login?returnTo=%2Fme%2Flog%2F5");
    expect(await redirectOf(me.load, "/th/me/login?returnTo=%2Fme%2Flog%2F5")).toBeNull();
    expect(await redirectOf(me.load, "/en/me/link/abc")).toBeNull();
  });

  test("signed in on the sign-in page → back to /th/me/log/5", async () => {
    portal = { kind: "signedIn", me: { client: { id: "c1", name: "Nok" }, trainer: { name: "Ploy" } } } as PortalSession;
    expect(await redirectOf(me.load, "/th/me/login?returnTo=%2Fme%2Flog%2F5")).toBe("/th/me/log/5");
    expect(await redirectOf(me.load, "/en/me/login")).toBe("/en/me");
    expect(await redirectOf(me.load, "/th/me/login?returnTo=%2Fclients")).toBe("/th/me");
  });
});
