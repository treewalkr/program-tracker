import { beforeNavigate } from "$app/navigation";
import { createLeaveGuard, type Asker } from "$lib/leaveGuard.svelte";

export interface LibraryGuardOptions {
  /** True while the page holds unsaved work (see `$lib/libraryDraft`). */
  dirty: () => boolean;
  /** What would be lost, as a singular noun phrase: "Your new rule", "Your edit to Deload policy". */
  what: () => string;
  /**
   * The page keeps its filters in the query string and stays mounted when they
   * change: a navigation to the same path isn't leaving.
   */
  queryStays?: boolean;
}

export interface LibraryGuard {
  /** Render it with `<LeaveGuard guard={…asker} />`; it also serves the page's other confirms. */
  asker: Asker;
  /**
   * Before an in-page action replaces the form (New, Cancel, opening another
   * item): resolves true when nothing is unsaved or the trainer agrees to drop it.
   */
  discard: () => Promise<boolean>;
}

/**
 * The library pages' leave guard: SPA links and Back ask while `dirty()`,
 * and `discard()` asks the same before an in-page action drops the form.
 * Call during component init.
 */
export function createLibraryGuard(opts: LibraryGuardOptions): LibraryGuard {
  // Runs before the leave guard's own hook (registration order), so it can see where this navigation goes.
  let staying = false;
  beforeNavigate((nav) => {
    staying = !!opts.queryStays && !!nav.from && !!nav.to && nav.from.url.pathname === nav.to.url.pathname;
  });
  const asker = createLeaveGuard({
    dirty: () => !staying && opts.dirty(),
    prompt: () => ({ title: "Leave without saving?", body: `${opts.what()} isn't saved. Leaving drops it.` }),
  });
  return {
    asker,
    async discard() {
      if (!opts.dirty()) return true;
      const a = await asker.ask({
        title: "Discard your changes?",
        body: `${opts.what()} isn't saved.`,
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      });
      return a === "confirm";
    },
  };
}
