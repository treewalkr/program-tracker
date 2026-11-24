import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
import { relinked, samePage } from "$lib/portal/lang";

/** Which button closed the dialog: `choice:<id>` for one of `choices`. Esc and a backdrop click count as "cancel". */
export type Answer = "confirm" | "alt" | "cancel" | `choice:${string}`;

/** One of several ways forward, listed as a stack of buttons above Cancel. */
export interface AskChoice {
  id: string;
  label: string;
  /** What it does, in one short line under the label. */
  hint?: string;
}

export interface AskOptions {
  title: string;
  body: string;
  /** The action being asked about: the left-hand button. Omit when `choices` lists the ways forward. */
  confirmLabel?: string;
  /** Colour the action red because it drops work. Default true. */
  danger?: boolean;
  /** The safe choice: it takes initial focus and answers Esc and backdrop clicks. Default "Cancel". */
  cancelLabel?: string;
  /**
   * Optional third choice. With `run`, the dialog stays open on `busyLabel`
   * until it settles: `true` answers "alt", `false` answers "cancel".
   */
  alt?: { label: string; busyLabel?: string; run?: () => Promise<boolean> };
  /** More than two ways forward: each answers `choice:<id>`. */
  choices?: readonly AskChoice[];
}

/**
 * Promise-based stand-in for `confirm()`, rendered by one `<LeaveGuard>` per
 * page. `await guard.ask({...})` resolves with the button picked; a new ask
 * cancels one still open.
 */
export function createAsk() {
  let request = $state<AskOptions | null>(null);
  let busy = $state(false);
  let settle: ((a: Answer) => void) | null = null;

  function close(a: Answer) {
    const done = settle;
    settle = null;
    request = null;
    done?.(a);
  }

  return {
    get request() {
      return request;
    },
    get open() {
      return request !== null;
    },
    get busy() {
      return busy;
    },
    ask(opts: AskOptions): Promise<Answer> {
      if (busy) return Promise.resolve("cancel");
      close("cancel");
      request = opts;
      return new Promise((resolve) => (settle = resolve));
    },
    /** Called by the dialog's buttons; ignored while an alt action runs. */
    async answer(a: Answer) {
      if (!request || busy) return;
      const run = a === "alt" ? request.alt?.run : undefined;
      if (!run) return close(a);
      busy = true;
      let ok = false;
      try {
        ok = await run();
      } finally {
        busy = false;
        close(ok ? "alt" : "cancel");
      }
    },
  };
}

export type Asker = ReturnType<typeof createAsk>;

export interface LeaveGuardOptions {
  /** True while there is work that would be lost by leaving. */
  dirty: () => boolean;
  /** Words for the prompt, read when it opens; `danger: false` when leaving keeps the work (e.g. as a draft). */
  prompt: () => { title: string; body: string; leaveLabel?: string; danger?: boolean };
  /** Persist the work; resolve `true` when it is safe to leave. Omit to hide "Save and leave". */
  save?: () => Promise<boolean>;
}

/**
 * Intercepts in-app navigation while `dirty()` and asks in the page's
 * `<LeaveGuard>` dialog instead of the browser's `confirm()`. Closing or
 * reloading the tab can't show a custom dialog, so that still gets the
 * browser's own prompt. Call during component init; the returned asker also
 * serves the page's other confirms.
 */
export function createLeaveGuard(opts: LeaveGuardOptions): Asker {
  const asker = createAsk();
  let leaving = false;
  // a Back/Forward replayed after "leave": let exactly that popstate through.
  // Holds its delta, and drops once any navigation lands: SvelteKit skips
  // beforeNavigate while another navigation is in flight, and a flag left
  // standing would wave the next Back through unasked.
  let replaying: number | null = null;

  afterNavigate(() => {
    replaying = null;
  });

  beforeNavigate((nav) => {
    if (replaying !== null && nav.type === "popstate" && nav.delta === replaying) {
      replaying = null;
      return;
    }
    // an unprefixed link is re-sent under the language prefix: ask about that one
    if (leaving || !opts.dirty() || relinked(nav)) return;
    // switching language stays on the page, with its work
    if (nav.from && nav.to && samePage(nav.from.url, nav.to.url)) return;
    nav.cancel(); // for a tab close or reload this raises the browser's own prompt
    if (nav.type === "leave" || !nav.to) return;
    const to = nav.to.url.pathname + nav.to.url.search + nav.to.url.hash;
    const { title, body, leaveLabel = "Leave without saving", danger } = opts.prompt();
    const save = opts.save;
    const delta = nav.type === "popstate" ? nav.delta : undefined;
    void asker
      .ask({
        title,
        body,
        confirmLabel: leaveLabel,
        danger,
        cancelLabel: "Keep editing",
        alt: save && { label: "Save and leave", busyLabel: "Saving…", run: save },
      })
      .then(async (a) => {
        if (a === "cancel") return;
        // Back/Forward was held on this entry: step the same way rather than
        // pushing the destination again, which would trap the next Back here
        if (delta) {
          replaying = delta;
          history.go(delta);
          return;
        }
        leaving = true;
        try {
          await goto(to);
        } finally {
          leaving = false;
        }
      });
  });

  return asker;
}
