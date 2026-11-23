import { describe, expect, mock, test } from "bun:test";

// goBack's SvelteKit imports; backDelta never touches them
mock.module("$app/navigation", () => ({ goto: async () => {}, beforeNavigate: () => {}, afterNavigate: () => {} }));
const { backDelta } = await import("./back.svelte");

const at = (...paths: string[]) => paths.map((p) => `https://pt.test${p}`);

describe("backDelta", () => {
  test("one step back to the previous page", () => {
    expect(backDelta(at("/clients", "/clients/5"), 1, "/clients/5")).toBe(-1);
  });

  test("skips this page's hash and query entries", () => {
    const entries = at("/guide", "/guide/programs", "/guide/programs#weeks", "/guide/programs#missed?x");
    expect(backDelta(entries, 3, "/guide/programs")).toBe(-3);
    expect(backDelta(at("/clients", "/clients/5", "/clients/5?tab=log"), 2, "/clients/5")).toBe(-2);
  });

  test("the language prefix doesn't make another page", () => {
    expect(backDelta(at("/th/me", "/th/me/log/9", "/th/me/log/9#notes"), 2, "/me/log/9")).toBe(-2);
    expect(backDelta(at("/th/me/log/9", "/en/me/log/9"), 1, "/me/log/9")).toBeNull();
  });

  test("never lands on sign-in", () => {
    expect(backDelta(at("/login?returnTo=%2Fclients", "/clients"), 1, "/clients")).toBeNull();
    expect(backDelta(at("/th/me/login", "/th/me"), 1, "/me")).toBeNull();
    expect(backDelta(at("/me/link/abc", "/me", "/me#x"), 2, "/me")).toBeNull();
  });

  test("no earlier entry: null", () => {
    expect(backDelta([], 0, "/clients")).toBeNull();
    expect(backDelta(at("/clients/5"), 0, "/clients/5")).toBeNull();
    expect(backDelta(at("/clients/5", "/clients/5#a"), 1, "/clients/5")).toBeNull();
  });

  test("an entry with no URL ends the search", () => {
    expect(backDelta([null, "https://pt.test/clients/5"], 1, "/clients/5")).toBeNull();
  });
});
