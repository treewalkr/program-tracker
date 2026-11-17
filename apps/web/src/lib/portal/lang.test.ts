import { describe, expect, test } from "bun:test";
import { appPath, pickLang, relinked, samePage, splitLang, swapLang, withLang } from "./lang";

const u = (s: string) => new URL(s, "https://pt.test");

describe("splitLang", () => {
  test("reads a leading /en or /th", () => {
    expect(splitLang("/th/me/log/5")).toEqual({ lang: "th", path: "/me/log/5" });
    expect(splitLang("/en/clients")).toEqual({ lang: "en", path: "/clients" });
  });

  test("/th and /th/ are the home page", () => {
    expect(splitLang("/th")).toEqual({ lang: "th", path: "/" });
    expect(splitLang("/th/")).toEqual({ lang: "th", path: "/" });
  });

  test("only a whole segment counts: /thai, /english and /xx are not prefixes", () => {
    expect(splitLang("/thai")).toEqual({ lang: null, path: "/thai" });
    expect(splitLang("/english/x")).toEqual({ lang: null, path: "/english/x" });
    expect(splitLang("/xx/me")).toEqual({ lang: null, path: "/xx/me" });
    expect(splitLang("/")).toEqual({ lang: null, path: "/" });
  });
});

describe("withLang", () => {
  test("prefixes an app path, keeping query and hash", () => {
    expect(withLang("/me/link/abc?x=1#h", "en")).toBe("/en/me/link/abc?x=1#h");
    expect(withLang("/", "th")).toBe("/th");
    expect(withLang("/?tab=a", "th")).toBe("/th?tab=a");
    expect(withLang("/#top", "th")).toBe("/th#top");
  });

  test("replaces an existing prefix", () => {
    expect(withLang("/th/me", "en")).toBe("/en/me");
    expect(withLang("/en", "th")).toBe("/th");
  });

  test("leaves API, external and relative paths alone", () => {
    expect(withLang("/v1/auth/google?as=client", "th")).toBe("/v1/auth/google?as=client");
    expect(withLang("/v1", "th")).toBe("/v1");
    expect(withLang("//evil.test/x", "th")).toBe("//evil.test/x");
    expect(withLang("https://x.test/", "th")).toBe("https://x.test/");
    expect(withLang("?q=1", "th")).toBe("?q=1");
    expect(withLang("/v1beta", "th")).toBe("/th/v1beta");
  });
});

describe("swapLang", () => {
  test("keeps the page, query and hash", () => {
    expect(swapLang(u("/en/me/link/abc?x=1#h"), "th")).toBe("/th/me/link/abc?x=1#h");
    expect(swapLang(u("/th"), "en")).toBe("/en");
  });

  test("adds a prefix to an unprefixed URL", () => {
    expect(swapLang(u("/whats-new"), "th")).toBe("/th/whats-new");
  });
});

describe("appPath / samePage", () => {
  test("appPath drops the prefix", () => {
    expect(appPath(u("/th/me/log/5?x=1"))).toBe("/me/log/5");
    expect(appPath(u("/thai"))).toBe("/thai");
    expect(appPath(u("/en"))).toBe("/");
  });

  test("the same page in two languages is the same page", () => {
    expect(samePage(u("/th/me?x=1"), u("/en/me?x=1#h"))).toBe(true);
    expect(samePage(u("/th/me?x=1"), u("/me?x=1"))).toBe(true);
    expect(samePage(u("/th/me?x=1"), u("/th/me?x=2"))).toBe(false);
    expect(samePage(u("/th/me"), u("/th/me/log/5"))).toBe(false);
  });
});

describe("pickLang", () => {
  test("saved choice, then the browser, then English", () => {
    expect(pickLang("en", "th-TH")).toBe("en");
    expect(pickLang(null, "th-TH")).toBe("th");
    expect(pickLang("xx", "fr-FR")).toBe("en");
    expect(pickLang(null, undefined)).toBe("en");
  });
});

describe("relinked", () => {
  const nav = (type: string, path: string, id: string | null = "/me") => ({ type, to: { url: u(path), route: { id } } });

  test("an in-app link without a prefix is re-sent under one", () => {
    expect(relinked(nav("link", "/me/log/5#set-2"))).toBe(true);
  });

  test("prefixed links, gotos, unknown pages and API links go through", () => {
    expect(relinked(nav("link", "/th/me"))).toBe(false);
    expect(relinked(nav("goto", "/me"))).toBe(false);
    expect(relinked(nav("popstate", "/me"))).toBe(false);
    expect(relinked(nav("link", "/v1/auth/google", null))).toBe(false);
    expect(relinked({ type: "leave", to: null })).toBe(false);
  });
});
