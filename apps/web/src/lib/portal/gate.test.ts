import { describe, expect, test } from "bun:test";
import type { PortalSession } from "$lib/api/portalTypes";
import { isPortalPath, portalRedirect, portalReturnTo } from "./gate";

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
