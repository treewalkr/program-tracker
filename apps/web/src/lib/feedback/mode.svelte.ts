import { browser } from "$app/environment";

const KEY = "pt.feedbackMode";

/**
 * Feedback mode state. `on` survives reloads so a review session spans
 * navigation; `browsing` lets the trainer use the app (follow links, open
 * menus) without leaving feedback mode.
 */
class FeedbackMode {
  on = $state(browser && localStorage.getItem(KEY) === "1");
  browsing = $state(false);
  /** Items sent this session — shown on the bar as visible progress. */
  sent = $state(0);

  /** Picking clicks only when on and not browsing. */
  get picking() {
    return this.on && !this.browsing;
  }

  set(on: boolean) {
    this.on = on;
    this.browsing = false;
    if (browser) localStorage.setItem(KEY, on ? "1" : "0");
  }
}

export const feedbackMode = new FeedbackMode();
