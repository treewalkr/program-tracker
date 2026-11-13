import { beforeNavigate, goto } from "$app/navigation";

export interface LeaveGuardOptions {
  /** True while there is work that would be lost by leaving. */
  dirty: () => boolean;
  /** Persist the work; resolve `true` when it is safe to leave. Omit to hide "Save and leave". */
  save?: () => Promise<boolean>;
}

/**
 * Intercepts in-app navigation while `dirty()` and hands the choice to a
 * `<LeaveGuard>` dialog instead of the browser's `confirm()`. Closing or
 * reloading the tab can't show a custom dialog, so that still gets the
 * browser's own prompt. Call during component init.
 */
export function createLeaveGuard(opts: LeaveGuardOptions) {
  let target = $state<string | null>(null);
  let busy = $state(false);
  let leaving = false;

  beforeNavigate((nav) => {
    if (leaving || !opts.dirty()) return;
    if (nav.type === "leave" || !nav.to) {
      nav.cancel(); // raises the browser's own prompt
      return;
    }
    nav.cancel();
    target = nav.to.url.pathname + nav.to.url.search + nav.to.url.hash;
  });

  async function go() {
    const to = target;
    target = null;
    if (!to) return;
    leaving = true;
    try {
      await goto(to);
    } finally {
      leaving = false;
    }
  }

  return {
    get open() {
      return target !== null;
    },
    get busy() {
      return busy;
    },
    get canSave() {
      return !!opts.save;
    },
    /** Stay on the page. */
    stay() {
      if (!busy) target = null;
    },
    /** Leave and drop the work. */
    leave: go,
    /** Save, then leave; stays put when saving fails. */
    async saveAndLeave() {
      if (!opts.save || busy) return;
      busy = true;
      try {
        if (await opts.save()) await go();
        else target = null;
      } finally {
        busy = false;
      }
    },
  };
}

export type LeaveGuard = ReturnType<typeof createLeaveGuard>;
