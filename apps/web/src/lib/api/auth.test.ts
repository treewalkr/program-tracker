import { describe, expect, mock, test } from "bun:test";

// the Eden client reads SvelteKit env modules; these helpers never call it
mock.module("./treaty", () => ({ client: {} }));
const { safeReturnTo, toLogin } = await import("./auth");

const u = (s: string) => new URL(s, "https://pt.test");

describe("toLogin", () => {
  test("sign-in in the page's language, returnTo without the prefix", () => {
    expect(toLogin(u("/th/clients/5?tab=log"))).toBe("/th/login?returnTo=%2Fclients%2F5%3Ftab%3Dlog");
    expect(toLogin(u("/en/me/log/5"))).toBe("/en/login?returnTo=%2Fme%2Flog%2F5");
  });

  test("home and the sign-in page itself need no returnTo", () => {
    expect(toLogin(u("/th"))).toBe("/th/login");
    expect(toLogin(u("/en/login?returnTo=%2Fx"))).toBe("/en/login");
  });

  test("an anchor rides along, so an emailed ticket link survives sign-in", () => {
    expect(toLogin(u("/en/feedback#FB-042"))).toBe("/en/login?returnTo=%2Ffeedback%23FB-042");
    // anything but a plain anchor is dropped
    expect(toLogin(u("/en/feedback#x/../y?z"))).toBe("/en/login?returnTo=%2Ffeedback");
  });

  test("load's URL hides its hash: take it from the address bar for the same page", () => {
    const hidden = (s: string) =>
      new Proxy(u(s), {
        get(target, key) {
          if (key === "hash") throw new Error("Cannot access event.url.hash");
          const v = Reflect.get(target, key);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = { location: u("/feedback#FB-042") };
    try {
      expect(toLogin(hidden("/en/feedback"))).toBe("/en/login?returnTo=%2Ffeedback%23FB-042");
      expect(toLogin(hidden("/en/clients"))).toBe("/en/login?returnTo=%2Fclients");
    } finally {
      g.window = before;
    }
  });

  test("an unprefixed page keeps an unprefixed sign-in (the redirect adds one)", () => {
    expect(toLogin(u("/clients"))).toBe("/login?returnTo=%2Fclients");
  });
});

describe("safeReturnTo", () => {
  test("same-app paths only", () => {
    expect(safeReturnTo("/clients")).toBe("/clients");
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("https://evil.test")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });
});
