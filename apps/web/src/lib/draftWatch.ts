import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { api } from "$lib/api";
import { createGenerationWatch, type DraftNotice } from "$lib/generationWatch.svelte";

const ASKED_KEY = "pt:notify-asked";

/**
 * Ask for browser-notification permission the first time the trainer starts a
 * draft — once per browser: never again after a deny or a dismissed prompt.
 */
export function askNotifyPermission(): void {
  if (!browser || typeof Notification === "undefined" || Notification.permission !== "default") return;
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // no storage — still ask; the browser remembers a deny on its own
  }
  void Notification.requestPermission().catch(() => {});
}

/** The tab is hidden: a system notification that brings the trainer back to the draft. */
function browserNotify(notice: DraftNotice): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(notice.title, {
      body: notice.tone === "ready" ? "Ready for your review." : (notice.reason ?? "The AI call didn't finish."),
      tag: `draft-${notice.id}`,
    });
    n.onclick = () => {
      window.focus();
      generationWatch.dismiss(notice.id);
      void goto(notice.href);
      n.close();
    };
  } catch {
    // some mobile browsers only allow service-worker notifications — the in-app notice remains
  }
}

/** The app's one watcher (started by the root layout). */
export const generationWatch = createGenerationWatch({
  api,
  path: () => page.url.pathname,
  hidden: () => browser && document.visibilityState === "hidden",
  notify: browserNotify,
});
