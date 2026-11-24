/**
 * Newest released version, read from CHANGELOG.md at build time (vite `define`),
 * so the banner and the unread dot don't ship the changelog. The sections: $lib/releases.
 */
export const latest: string | null = __LATEST_RELEASE__;

const SEEN_KEY = "pt:seen-version";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

let seen = $state(readSeen());

/** Whether this browser has opened What's new since the newest release. */
export const whatsNew = {
  get unseen() {
    return latest !== null && seen !== latest;
  },
  markSeen() {
    if (!latest || seen === latest) return;
    seen = latest;
    try {
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      // private mode / storage full — the dot just comes back next visit
    }
  },
};
