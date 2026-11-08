import changelog from "../../../../CHANGELOG.md?raw";
import { latestVersion, parseChangelog } from "./changelog";

/** Released changelog sections, bundled at build time — same in demo and live mode. */
export const releases = parseChangelog(changelog);
export const latest = latestVersion(releases);

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
