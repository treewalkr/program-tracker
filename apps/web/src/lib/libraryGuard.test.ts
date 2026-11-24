import { describe, expect, mock, test } from "bun:test";

type Nav = { type: string; from?: { url: URL } | null; to: { url: URL } | null; cancel: () => void };
let navHook: ((nav: Nav) => void) | null = null;
mock.module("$app/navigation", () => ({
  beforeNavigate: (fn: (nav: Nav) => void) => (navHook = fn),
  goto: async () => {},
}));

const { createLibraryGuard } = await import("./libraryGuard.svelte");

describe("createLibraryGuard", () => {
  test("discard passes straight through when nothing is unsaved", async () => {
    const g = createLibraryGuard({ dirty: () => false, what: () => "Your new rule" });
    expect(await g.discard()).toBe(true);
    expect(g.asker.open).toBe(false);
  });

  test("discard asks when dirty, naming what goes; Discard drops it", async () => {
    const g = createLibraryGuard({ dirty: () => true, what: () => "Your new rule" });
    const p = g.discard();
    expect(g.asker.request?.body).toBe("Your new rule isn't saved.");
    await g.asker.answer("confirm");
    expect(await p).toBe(true);
  });

  test("Keep editing (or Esc) keeps the form", async () => {
    const g = createLibraryGuard({ dirty: () => true, what: () => "Your edit to Squat" });
    const p = g.discard();
    await g.asker.answer("cancel");
    expect(await p).toBe(false);
  });

  test("an in-app link is held while dirty and the prompt names the work", () => {
    const g = createLibraryGuard({ dirty: () => true, what: () => "Your new template" });
    let cancelled = false;
    navHook!({ type: "link", from: { url: new URL("http://x/en/templates") }, to: { url: new URL("http://x/en/clients") }, cancel: () => (cancelled = true) });
    expect(cancelled).toBe(true);
    expect(g.asker.request?.body).toBe("Your new template isn't saved. Leaving drops it.");
  });
});
