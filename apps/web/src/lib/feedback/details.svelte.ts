const KEY = "pt:feedback-details";

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === "open";
  } catch {
    return false;
  }
}

let open = $state(readOpen());

/**
 * Whether tickets on /feedback show their metadata (page, source, device).
 * One choice for every ticket, remembered per device; closed by default.
 */
export const ticketDetails = {
  get open() {
    return open;
  },
  toggle() {
    open = !open;
    try {
      localStorage.setItem(KEY, open ? "open" : "closed");
    } catch {
      // private mode / storage full — the choice lasts until reload
    }
  },
};
