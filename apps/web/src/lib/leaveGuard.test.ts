import { describe, expect, mock, test } from "bun:test";
import { render } from "svelte/server";

type Nav = { type: string; to: { url: URL } | null; cancel: () => void };
let navHook: ((nav: Nav) => void) | null = null;
const gotos: string[] = [];
mock.module("$app/navigation", () => ({
  beforeNavigate: (fn: (nav: Nav) => void) => (navHook = fn),
  goto: async (to: string) => void gotos.push(to),
}));

const { createAsk, createLeaveGuard } = await import("./leaveGuard.svelte");
const { default: LeaveGuard } = await import("./ui/LeaveGuard.svelte");

const opts = { title: "Skip Squat?", body: "Extra sets go.", confirmLabel: "Skip" };

function navigate(type = "link", path = "/clients") {
  let cancelled = false;
  navHook!({ type, to: type === "leave" ? null : { url: new URL(path, "http://x") }, cancel: () => (cancelled = true) });
  return cancelled;
}

describe("ask", () => {
  test("resolves with the button picked and closes", async () => {
    const a = createAsk();
    const p = a.ask(opts);
    expect(a.open).toBe(true);
    expect(a.request?.title).toBe("Skip Squat?");
    await a.answer("confirm");
    expect(await p).toBe("confirm");
    expect(a.open).toBe(false);
  });

  test("a second ask cancels the first", async () => {
    const a = createAsk();
    const first = a.ask(opts);
    const second = a.ask({ ...opts, title: "Other" });
    expect(await first).toBe("cancel");
    expect(a.request?.title).toBe("Other");
    a.answer("alt");
    expect(await second).toBe("alt");
  });

  test("an alt with run stays open and busy until it settles", async () => {
    const a = createAsk();
    let finish!: (ok: boolean) => void;
    const p = a.ask({ ...opts, alt: { label: "Save", run: () => new Promise((r) => (finish = r)) } });
    const answering = a.answer("alt");
    expect(a.busy).toBe(true);
    expect(a.open).toBe(true);
    await a.answer("cancel"); // ignored while busy
    expect(a.open).toBe(true);
    finish(true);
    await answering;
    expect(await p).toBe("alt");
    expect(a.busy).toBe(false);
  });

  test("a failed alt run answers cancel", async () => {
    const a = createAsk();
    const p = a.ask({ ...opts, alt: { label: "Save", run: async () => false } });
    await a.answer("alt");
    expect(await p).toBe("cancel");
  });
});

describe("leave guard", () => {
  test("lets navigation through when clean", () => {
    createLeaveGuard({ dirty: () => false, prompt: () => ({ title: "t", body: "b" }) });
    expect(navigate()).toBe(false);
  });

  test("holds a dirty in-app navigation and goes on when told to leave", async () => {
    gotos.length = 0;
    const g = createLeaveGuard({ dirty: () => true, prompt: () => ({ title: "Leave?", body: "b" }) });
    expect(navigate("link", "/clients?x=1")).toBe(true);
    expect(g.request).toMatchObject({ title: "Leave?", confirmLabel: "Leave without saving", cancelLabel: "Keep editing" });
    expect(g.request?.alt).toBeFalsy();
    await g.answer("confirm");
    await Promise.resolve();
    expect(gotos).toEqual(["/clients?x=1"]);
  });

  test("keep editing stays put", async () => {
    gotos.length = 0;
    const g = createLeaveGuard({ dirty: () => true, prompt: () => ({ title: "t", body: "b" }) });
    navigate();
    await g.answer("cancel");
    await Promise.resolve();
    expect(gotos).toEqual([]);
  });

  test("offers save and leave when the page can save", async () => {
    gotos.length = 0;
    const g = createLeaveGuard({ dirty: () => true, save: async () => true, prompt: () => ({ title: "t", body: "b" }) });
    navigate("link", "/programs");
    expect(g.request?.alt?.label).toBe("Save and leave");
    await g.answer("alt");
    await Promise.resolve();
    expect(gotos).toEqual(["/programs"]);
  });

  test("a tab close only cancels, for the browser's own prompt", () => {
    const g = createLeaveGuard({ dirty: () => true, prompt: () => ({ title: "t", body: "b" }) });
    expect(navigate("leave")).toBe(true);
    expect(g.open).toBe(false);
  });
});

describe("LeaveGuard dialog", () => {
  const html = (o: Parameters<ReturnType<typeof createAsk>["ask"]>[0]) => {
    const a = createAsk();
    void a.ask(o);
    return render(LeaveGuard, { props: { guard: a } }).body;
  };

  test("the safe choice is last and takes focus; the action is red by default", () => {
    const body = html({ ...opts, alt: { label: "Keep draft" } });
    const labels = [...body.matchAll(/<button[^>]*>\s*([^<]+?)\s*<\/button>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Skip", "Keep draft", "Cancel"]);
    expect(body).toMatch(/<button[^>]*class="btn primary[^"]*"[^>]*autofocus[^>]*>\s*Cancel/);
    expect(body).toMatch(/class="btn[^"]* danger ghost"[^>]*>\s*Skip/);
  });

  test("danger: false keeps the action neutral", () => {
    const body = html({ ...opts, danger: false });
    expect(body).not.toContain("danger");
  });

  test("renders nothing inside the dialog when closed", () => {
    const body = render(LeaveGuard, { props: { guard: createAsk() } }).body;
    expect(body).not.toContain("<button");
  });
});
