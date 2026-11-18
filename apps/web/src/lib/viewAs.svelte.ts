import { goto, invalidateAll } from "$app/navigation";
import { authApi, type Impersonator } from "$lib/api/auth";
import { adminApi } from "$lib/api/admin";
import { inLang } from "$lib/portal/i18n.svelte";
import { minutesLeft, viewState, type ViewState } from "./viewAs";

/**
 * The admin's "view as trainer", app-wide: the root layout feeds it the
 * session's impersonator block; the banner reads it; Stop, Allow edits and
 * Lock go through it. A clock ticks once a second while a view is on, so the
 * minutes left stay true; when either runs out the session is reloaded
 * (the server then reports the view as ended, or back to read-only).
 */
class ViewAs {
  view = $state<Impersonator | null>(null);
  now = $state(Date.now());
  busy = $state(false);
  error = $state<string | null>(null);
  #timer: ReturnType<typeof setInterval> | undefined;
  #reloadedAt: string | null = null;

  /** Live or ended, there is a view on the session. */
  get active() {
    return this.view !== null;
  }
  /** A live view: the app is the trainer's (hide admin-only chrome, the feedback pin…). */
  get live() {
    return this.view !== null && this.state !== "ended";
  }
  get state(): ViewState | null {
    return this.view ? viewState(this.view, this.now) : null;
  }
  get minutes(): number {
    if (!this.view) return 0;
    return minutesLeft(this.state === "edits" && this.view.writesUntil ? this.view.writesUntil : this.view.until, this.now);
  }

  /** From the root layout's session. */
  sync(view: Impersonator | null | undefined) {
    this.view = view ?? null;
    this.now = Date.now();
    this.error = null;
    clearInterval(this.#timer);
    if (this.view && !this.view.ended) this.#timer = setInterval(() => this.#tick(), 1000);
  }

  #tick() {
    this.now = Date.now();
    const v = this.view;
    if (!v) return;
    // a deadline passed in the browser: ask the server once what's true now
    const due = [v.until, v.writesUntil].find((d) => d && new Date(d).getTime() <= this.now);
    if (due && this.#reloadedAt !== due) {
      this.#reloadedAt = due;
      void invalidateAll();
    }
  }

  async #run(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await work();
    } catch (err) {
      this.error = err instanceof Error ? err.message : "That didn't work";
    } finally {
      this.busy = false;
    }
  }

  /** Admin: open the app as a trainer; from a ticket it lands on the page the ticket came from. */
  start(trainerId: string, ticketId?: string) {
    return this.#run(async () => {
      const to = await adminApi.startViewing({ trainerId, ticketId });
      await goto(inLang(to), { invalidateAll: true });
    });
  }

  stop() {
    return this.#run(async () => {
      const to = await authApi.stopViewing();
      await goto(inLang(to), { invalidateAll: true });
    });
  }

  /** Throws so the dialog can show why (a wrong name). */
  async allowEdits(confirm: string) {
    const writesUntil = await authApi.allowEdits(confirm);
    if (this.view) this.view = { ...this.view, writesUntil };
  }

  lock() {
    return this.#run(async () => {
      await authApi.lockEdits();
      if (this.view) this.view = { ...this.view, writesUntil: null };
    });
  }
}

export const viewAs = new ViewAs();
