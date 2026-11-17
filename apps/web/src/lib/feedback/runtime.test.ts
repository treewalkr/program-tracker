import { afterEach, describe, expect, test } from "bun:test";
import { FEEDBACK_RUNTIME_CAPS, FeedbackRuntimeSchema } from "@pt/shared";
import { capturingFetch, installRuntimeCapture, RuntimeRecorder, stackHead } from "./runtime";

const env = { locale: "th-TH", online: true, standalone: false };

/** A recorder on a clock the test moves. */
function clocked() {
  let t = 1_000_000;
  const rec = new RuntimeRecorder(() => t);
  return { rec, tick: (ms: number) => (t += ms) };
}

/** Just enough of a window: events, and a console to patch. */
function fakeWindow() {
  const target = new EventTarget();
  const logged: unknown[][] = [];
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    console: { error: (...a: unknown[]) => void logged.push(a) },
    logged,
  };
}

/** An element as cssPath reads it: tag, classes, parent. Its `value` must never be recorded. */
const input = (value: string) =>
  ({ tagName: "INPUT", id: "", classList: ["weight"], parentElement: null, value, textContent: value }) as unknown as Element;

let undo: (() => void) | null = null;
afterEach(() => {
  undo?.();
  undo = null;
});

describe("RuntimeRecorder", () => {
  test("ring buffers keep only the newest entries", () => {
    const { rec } = clocked();
    for (let i = 0; i < 30; i++) {
      rec.error("console", `e${i}`);
      rec.request({ method: "get", url: `/v1/x/${i}`, status: 500, ms: 5, requestId: `r${i}` });
      rec.breadcrumb("click", `button:nth-of-type(${i})`);
    }
    const s = rec.snapshot(env);
    expect(s.errors).toHaveLength(FEEDBACK_RUNTIME_CAPS.errors);
    expect(s.errors[0].message).toBe("e10");
    expect(s.requests).toHaveLength(FEEDBACK_RUNTIME_CAPS.requests);
    expect(s.requests[s.requests.length - 1].requestId).toBe("r29");
    expect(s.breadcrumbs).toHaveLength(FEEDBACK_RUNTIME_CAPS.breadcrumbs);
  });

  test("keeps failed and slow requests only, path without query", () => {
    const { rec } = clocked();
    rec.request({ method: "get", url: "http://h/v1/clients?q=somchai", status: 200, ms: 40, requestId: "a" });
    rec.request({ method: "get", url: "http://h/v1/clients?q=somchai", status: 200, ms: 2500, requestId: "b" });
    rec.request({ method: "post", url: "/v1/feedback?x=1", status: 422, ms: 12.4, requestId: "c" });
    rec.request({ method: "get", url: "/v1/meta", status: null, ms: 3, requestId: null });
    expect(rec.snapshot(env).requests).toEqual([
      { method: "GET", path: "/v1/clients", status: 200, ms: 2500, requestId: "b", msAgo: 0 },
      { method: "POST", path: "/v1/feedback", status: 422, ms: 12, requestId: "c", msAgo: 0 },
      { method: "GET", path: "/v1/meta", status: null, ms: 3, requestId: null, msAgo: 0 },
    ]);
  });

  test("messages capped at 500, stacks at 8 lines", () => {
    const { rec } = clocked();
    const stack = Array.from({ length: 20 }, (_, i) => `at f${i} (app.js:${i})`).join("\n");
    rec.error("error", "x".repeat(900), stack);
    const [e] = rec.snapshot(env).errors;
    expect(e.message).toHaveLength(500);
    expect(e.stack!.split("\n")).toHaveLength(8);
    expect(stackHead(undefined)).toBeUndefined();
  });

  test("snapshot: msAgo from filing, redacted, valid for the API", () => {
    const { rec, tick } = clocked();
    rec.breadcrumb("route", "/clients");
    rec.breadcrumb("route", "/clients"); // same route twice is one step
    tick(4000);
    rec.error("rejection", "no client kai@example.com");
    tick(1000);
    rec.role = "trainer";
    const s = rec.snapshot(env);
    expect(s.breadcrumbs).toEqual([{ kind: "route", detail: "/clients", msAgo: 5000 }]);
    expect(s.errors[0]).toEqual({ source: "rejection", message: "no client [email]", msAgo: 1000 });
    expect(s.session).toEqual({ role: "trainer", locale: "th-TH", online: true, standalone: false });
    expect(FeedbackRuntimeSchema.safeParse(s).success).toBe(true);
  });
});

describe("installRuntimeCapture", () => {
  test("records errors, rejections, console.error, clicks and submits — never input text", () => {
    const { rec } = clocked();
    const win = fakeWindow();
    undo = installRuntimeCapture(win as never, rec);

    const err = Object.assign(new Event("error"), { message: "boom", error: new Error("boom") });
    win.dispatchEvent(err);
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new TypeError("bad") }));
    win.console.error("save failed", { status: 500 });
    expect(win.logged).toEqual([["save failed", { status: 500 }]]);

    const field = input("my secret 0812345678");
    const click = new Event("click");
    Object.defineProperty(click, "target", { value: field });
    win.dispatchEvent(click);
    const submit = new Event("submit");
    Object.defineProperty(submit, "target", { value: field });
    win.dispatchEvent(submit);

    const s = rec.snapshot(env);
    expect(s.errors.map((e) => [e.source, e.message])).toEqual([
      ["error", "boom"],
      ["rejection", "TypeError: bad"],
      ["console", 'save failed {"status":500}'],
    ]);
    expect(s.breadcrumbs.map((b) => [b.kind, b.detail])).toEqual([
      ["click", "input.weight"],
      ["submit", "input.weight"],
    ]);
    expect(JSON.stringify(s)).not.toContain("secret");
  });

  test("undo restores console.error", () => {
    const win = fakeWindow();
    const original = win.console.error;
    undo = installRuntimeCapture(win as never, new RuntimeRecorder());
    expect(win.console.error).not.toBe(original);
    undo();
    undo = null;
    expect(win.console.error).toBe(original);
  });
});

describe("capturingFetch", () => {
  test("records a failed call with its request id; passes the response through", async () => {
    const { rec } = clocked();
    const res = new Response("{}", { status: 404, headers: { "x-request-id": "ab12cd34" } });
    const f = capturingFetch(() => (async () => res) as unknown as typeof fetch, rec);
    expect(await f("http://h/v1/clients/c1?tab=log", { method: "GET" })).toBe(res);
    expect(rec.snapshot(env).requests).toMatchObject([{ path: "/v1/clients/c1", status: 404, requestId: "ab12cd34" }]);
  });

  test("a network failure is recorded with no status and rethrown", async () => {
    const { rec } = clocked();
    const f = capturingFetch(() => (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch, rec);
    await expect(f("/v1/meta", { method: "POST" })).rejects.toThrow("offline");
    expect(rec.snapshot(env).requests).toMatchObject([{ method: "POST", status: null, requestId: null }]);
  });
});
