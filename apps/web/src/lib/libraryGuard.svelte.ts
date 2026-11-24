import { createLeaveGuard, type Asker } from "$lib/leaveGuard.svelte";

export interface LibraryGuardOptions {
  /** True while the page holds unsaved work (see `$lib/libraryDraft`). */
  dirty: () => boolean;
  /** What would be lost, as a singular noun phrase: "Your new rule", "Your edit to Deload policy". */
  what: () => string;
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
  const asker = createLeaveGuard({
    dirty: opts.dirty,
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
