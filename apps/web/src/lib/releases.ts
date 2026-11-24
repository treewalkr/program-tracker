import changelog from "../../../../CHANGELOG.md?raw";
import { parseChangelog } from "./changelog";

/**
 * Released changelog sections, bundled at build time — same in demo and live mode.
 * Only the What's new page imports this: the 130 KB changelog stays off the startup path.
 */
export const releases = parseChangelog(changelog);
