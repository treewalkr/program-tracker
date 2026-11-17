import { FEEDBACK_RUNTIME_CAPS as CAPS, redactJson, type FeedbackRuntime } from "@pt/shared";
import { cssPath, isFeedbackUi } from "./capture";

/**
 * Runtime capture for feedback tickets: small ring buffers of recent errors,
 * failed or slow API calls and the steps that led to the report. Memory
 * only — nothing leaves the browser until a ticket is filed, and then only as
 * a redacted snapshot. Never records request bodies or the text of inputs.
 */

/** A request at least this slow is recorded even when it succeeded. */
export const SLOW_MS = 2000;

type At<T> = T & { at: number };
type ErrorEntry = At<Omit<FeedbackRuntime["errors"][number], "msAgo">>;
type RequestEntry = At<Omit<FeedbackRuntime["requests"][number], "msAgo">>;
type Breadcrumb = At<Omit<FeedbackRuntime["breadcrumbs"][number], "msAgo">>;

const cap = (s: string, max: number = CAPS.text) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The first CAPS.stackLines lines of a stack, capped. */
export const stackHead = (stack: string | undefined): string | undefined =>
  stack ? cap(stack.split("\n").slice(0, CAPS.stackLines).map((l) => l.trim()).join("\n")) : undefined;

/** Text for one thing passed to console.error or thrown: an Error's message, a string, or JSON. */
function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

export class RuntimeRecorder {
  private errors: ErrorEntry[] = [];
  private requests: RequestEntry[] = [];
  private crumbs: Breadcrumb[] = [];
  /** `admin` / `trainer`, set by the root layout. */
  role: string | null = null;

  constructor(private now: () => number = () => Date.now()) {}

  private push<T>(list: T[], entry: T, max: number) {
    list.push(entry);
    if (list.length > max) list.splice(0, list.length - max);
  }

  error(source: ErrorEntry["source"], message: string, stack?: string) {
    const head = stackHead(stack);
    this.push(
      this.errors,
      { source, message: cap(message.trim() || "(no message)"), ...(head ? { stack: head } : {}), at: this.now() },
      CAPS.errors,
    );
  }

  /** One finished API call; kept only when it failed (no response or >= 400) or took SLOW_MS or more. */
  request(r: { method: string; url: string; status: number | null; ms: number; requestId: string | null }) {
    if (r.status !== null && r.status < 400 && r.ms < SLOW_MS) return;
    let path = r.url;
    try {
      path = new URL(r.url, "http://x").pathname;
    } catch {
      path = r.url.split(/[?#]/)[0];
    }
    this.push(
      this.requests,
      {
        method: cap(r.method.toUpperCase(), 10),
        path: cap(path),
        status: r.status,
        ms: Math.max(0, Math.round(r.ms)),
        requestId: r.requestId && r.requestId.length <= 64 ? r.requestId : null,
        at: this.now(),
      },
      CAPS.requests,
    );
  }

  /** A route change (its path), or a click / form submit (a selector path — never what was typed). */
  breadcrumb(kind: Breadcrumb["kind"], detail: string) {
    const last = this.crumbs.at(-1);
    if (kind === "route" && last?.kind === "route" && last.detail === detail) return;
    this.push(this.crumbs, { kind, detail: cap(detail), at: this.now() }, CAPS.breadcrumbs);
  }

  /** What a ticket carries: every buffer with `msAgo` from now, redacted. */
  snapshot(env: { locale: string; online: boolean; standalone: boolean }): FeedbackRuntime {
    const t = this.now();
    const ago = <T extends { at: number }>({ at, ...rest }: T) => ({ ...rest, msAgo: Math.max(0, t - at) });
    return redactJson({
      errors: this.errors.map(ago),
      requests: this.requests.map(ago),
      breadcrumbs: this.crumbs.map(ago),
      session: { role: this.role, locale: cap(env.locale, 40), online: env.online, standalone: env.standalone },
    }) as FeedbackRuntime;
  }

  clear() {
    this.errors = [];
    this.requests = [];
    this.crumbs = [];
  }
}

/** The app's one recorder. */
export const runtime = new RuntimeRecorder();

/** Selector path of a clicked or submitted element; null for the feedback UI itself and non-elements. */
function selectorOf(target: EventTarget | null): string | null {
  const el = target as Element | null;
  if (!el || typeof (el as { tagName?: unknown }).tagName !== "string") return null;
  if (typeof Element !== "undefined" && isFeedbackUi(el)) return null;
  return cssPath(el);
}

type Win = Pick<Window, "addEventListener" | "removeEventListener"> & { console: Pick<Console, "error"> };

let installed: (() => void) | null = null;

/**
 * Start recording: window errors, unhandled rejections, console.error, clicks
 * and form submits. Once per page (later calls are no-ops); returns the undo,
 * for tests. Route changes come from the root layout (`afterNavigate`), API
 * calls from the Eden client (`capturingFetch`).
 */
export function installRuntimeCapture(win: Win = window, rec: RuntimeRecorder = runtime): () => void {
  if (installed) return installed;
  const onError = (e: Event) => {
    const ev = e as ErrorEvent;
    rec.error("error", ev.message || describe(ev.error), ev.error instanceof Error ? ev.error.stack : undefined);
  };
  const onRejection = (e: Event) => {
    const reason = (e as PromiseRejectionEvent).reason;
    rec.error("rejection", describe(reason), reason instanceof Error ? reason.stack : undefined);
  };
  const onClick = (e: Event) => {
    const sel = selectorOf(e.target);
    if (sel) rec.breadcrumb("click", sel);
  };
  const onSubmit = (e: Event) => {
    const sel = selectorOf(e.target);
    if (sel) rec.breadcrumb("submit", sel);
  };
  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  win.addEventListener("click", onClick, { capture: true });
  win.addEventListener("submit", onSubmit, { capture: true });
  const original = win.console.error;
  win.console.error = (...args: unknown[]) => {
    try {
      const err = args.find((a): a is Error => a instanceof Error);
      rec.error("console", args.map(describe).join(" "), err?.stack);
    } catch {
      // recording must never break logging
    }
    original.apply(win.console, args);
  };
  installed = () => {
    win.removeEventListener("error", onError);
    win.removeEventListener("unhandledrejection", onRejection);
    win.removeEventListener("click", onClick, { capture: true });
    win.removeEventListener("submit", onSubmit, { capture: true });
    win.console.error = original;
    installed = null;
  };
  return installed;
}

/**
 * A fetch that tells the recorder how each call went: method, path, status,
 * time and the response's `x-request-id`. For the Eden client's `fetcher`.
 */
export function capturingFetch(base: () => typeof fetch, rec: RuntimeRecorder = runtime): typeof fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    try {
      const res = await base()(input, init);
      rec.request({ method, url, status: res.status, ms: performance.now() - started, requestId: res.headers.get("x-request-id") });
      return res;
    } catch (err) {
      rec.request({ method, url, status: null, ms: performance.now() - started, requestId: null });
      throw err;
    }
  };
  return wrapped as typeof fetch;
}

/** The snapshot a ticket carries, read from the browser; undefined outside it. */
export function runtimeSnapshot(rec: RuntimeRecorder = runtime): FeedbackRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return rec.snapshot({
    locale: navigator.language || "",
    online: navigator.onLine,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  });
}
