import { describe, expect, test } from "bun:test";
import type { PortalSession } from "$lib/api/portalTypes";
import { gateSession, isPortalPath, parseCachedSession, portalRedirect, portalReturnTo } from "./gate";

const out: PortalSession = { kind: "signedOut" };
const inn: PortalSession = { kind: "signedIn", me: { client: { id: "c1", name: "Nok" }, trainer: { name: "Ploy" } } };

describe("portal gate", () => {
  test("only /me and below are portal routes", () => {
    expect(isPortalPath("/me")).toBe(true);
    expect(isPortalPath("/me/log/abc")).toBe(true);
    expect(isPortalPath("/messages")).toBe(false);
    expect(isPortalPath("/")).toBe(false);
  });

  test("signed out: sent to the portal sign-in, except sign-in and access links", () => {
    expect(portalRedirect("/me", out)).toBe("/me/login");
    expect(portalRedirect("/me/log/s1?d=2", out)).toBe("/me/login?returnTo=%2Fme%2Flog%2Fs1%3Fd%3D2");
    expect(portalRedirect("/me/login", out)).toBeNull();
    expect(portalRedirect("/me/link/tok", out)).toBeNull();
  });

  test("signed in: through, and off the sign-in page", () => {
    expect(portalRedirect("/me", inn)).toBeNull();
    expect(portalRedirect("/me/link/tok", inn)).toBeNull();
    expect(portalRedirect("/me/login", inn)).toBe("/me");
    expect(portalRedirect("/me/login?returnTo=x", inn, "/me/log/s1")).toBe("/me/log/s1");
  });

  test("returnTo is a portal page or nothing", () => {
    expect(portalReturnTo("/me/log/5?d=1")).toBe("/me/log/5?d=1");
    expect(portalReturnTo("/clients")).toBe("/me");
    expect(portalReturnTo("//evil.test/me")).toBe("/me");
    expect(portalReturnTo("/messages")).toBe("/me");
    expect(portalReturnTo(null)).toBe("/me");
  });
});

describe("portal gate offline", () => {
  const memory = (v: string | null = null) => {
    let value = v;
    return { get: () => value, set: (x: string | null) => void (value = x), peek: () => value };
  };

  test("a signed-in check is remembered; a 401 forgets it", async () => {
    const store = memory();
    expect(await gateSession(async () => inn, store)).toEqual({ session: inn, offline: false });
    expect(parseCachedSession(store.peek())).toEqual(inn);
    expect(await gateSession(async () => out, store)).toEqual({ session: out, offline: false });
    expect(store.peek()).toBeNull();
  });

  test("a real sign-out, or another member signed in, forgets this phone's copies", async () => {
    let cleared = 0;
    const forget = () => void cleared++;
    await gateSession(async () => inn, memory(JSON.stringify(inn)), forget);
    expect(cleared).toBe(0);
    // first sign-in on this phone: nothing to forget
    await gateSession(async () => inn, memory(), forget);
    expect(cleared).toBe(0);
    await gateSession(async () => out, memory(JSON.stringify(inn)), forget);
    expect(cleared).toBe(1);
    const other: PortalSession = { kind: "signedIn", me: { client: { id: "c-other", name: "Bee" }, trainer: { name: "Coach" } } };
    const store = memory(JSON.stringify(inn));
    expect(await gateSession(async () => other, store, forget)).toEqual({ session: other, offline: false });
    expect(cleared).toBe(2);
    expect(parseCachedSession(store.peek())).toEqual(other);
    // a failed check is no answer: nothing is forgotten
    await gateSession(async () => Promise.reject(new Error("503")), memory(JSON.stringify(inn)), forget);
    expect(cleared).toBe(2);
  });

  test("a failed check falls back to the last signed-in session on this phone", async () => {
    const store = memory(JSON.stringify(inn));
    const failing = async (): Promise<PortalSession> => {
      throw new Error("portal session check failed: 503");
    };
    expect(await gateSession(failing, store)).toEqual({ session: inn, offline: true });
    // the copy stays for the next tap
    expect(parseCachedSession(store.peek())).toEqual(inn);
  });

  test("a failed check with nothing (or junk) remembered has no session", async () => {
    const failing = async (): Promise<PortalSession> => {
      throw new TypeError("Failed to fetch");
    };
    expect(await gateSession(failing, memory())).toEqual({ session: null, offline: true });
    expect(await gateSession(failing, memory("{junk"))).toEqual({ session: null, offline: true });
    expect(await gateSession(failing, memory(JSON.stringify(out)))).toEqual({ session: null, offline: true });
  });
});
