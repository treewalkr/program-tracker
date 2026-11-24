import { beforeEach, describe, expect, mock, test } from "bun:test";

type Nav = { type: string; from?: { url: URL } | null; to: { url: URL } | null; cancel: () => void };
let hooks: ((nav: Nav) => void)[] = [];
const navigate = (nav: Nav) => hooks.forEach((h) => h(nav));
mock.module("$app/navigation", () => ({
  beforeNavigate: (fn: (nav: Nav) => void) => void hooks.push(fn),
  afterNavigate: () => {},
  goto: async () => {},
}));

const { createLibraryGuard } = await import("./libraryGuard.svelte");

describe("createLibraryGuard", () => {
  beforeEach(() => (hooks = []));

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
    navigate({ type: "link", from: { url: new URL("http://x/en/templates") }, to: { url: new URL("http://x/en/clients") }, cancel: () => (cancelled = true) });
    expect(cancelled).toBe(true);
    expect(g.asker.request?.body).toBe("Your new template isn't saved. Leaving drops it.");
  });

  const nav = (from: string, to: string, cancel: () => void): Nav => ({
    type: "goto",
    from: { url: new URL(`http://x${from}`) },
    to: { url: new URL(`http://x${to}`) },
    cancel,
  });

  test("with queryStays, a filter change on the same path goes through; another path still asks", () => {
    const g = createLibraryGuard({ dirty: () => true, what: () => "Your new exercise", queryStays: true });
    let cancelled = false;
    navigate(nav("/en/exercises", "/en/exercises?tab=mine", () => (cancelled = true)));
    expect(cancelled).toBe(false);
    expect(g.asker.open).toBe(false);
    navigate(nav("/en/exercises", "/en/clients", () => (cancelled = true)));
    expect(cancelled).toBe(true);
  });

  test("without it, a query change (a tab that unmounts the form) asks", () => {
    createLibraryGuard({ dirty: () => true, what: () => "Your new term" });
    let cancelled = false;
    navigate(nav("/en/vocabulary?tab=glossary", "/en/vocabulary?tab=roles", () => (cancelled = true)));
    expect(cancelled).toBe(true);
  });
});
