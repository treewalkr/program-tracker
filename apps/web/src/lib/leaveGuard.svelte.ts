import { beforeNavigate, goto } from "$app/navigation";

/** Which button closed the dialog. Esc and a backdrop click count as "cancel". */
export type Answer = "confirm" | "alt" | "cancel";

export interface AskOptions {
  title: string;
  body: string;
  /** The action being asked about: the left-hand button. */
  confirmLabel: string;
  /** Colour the action red because it drops work. Default true. */
  danger?: boolean;
  /** The safe choice: it takes initial focus and answers Esc and backdrop clicks. Default "Cancel". */
  cancelLabel?: string;
  /**
   * Optional third choice. With `run`, the dialog stays open on `busyLabel`
   * until it settles: `true` answers "alt", `false` answers "cancel".
   */
  alt?: { label: string; busyLabel?: string; run?: () => Promise<boolean> };
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

  beforeNavigate((nav) => {
    if (leaving || !opts.dirty()) return;
    nav.cancel(); // for a tab close or reload this raises the browser's own prompt
    if (nav.type === "leave" || !nav.to) return;
    const to = nav.to.url.pathname + nav.to.url.search + nav.to.url.hash;
    const { title, body, leaveLabel = "Leave without saving", danger } = opts.prompt();
    const save = opts.save;
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
