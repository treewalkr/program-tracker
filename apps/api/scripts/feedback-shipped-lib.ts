import { feedbackHandlesIn } from "@pt/shared";

/** One commit that names tickets, as the shipped route takes it. */
export interface ShippedCommit {
  sha: string;
  subject: string;
  handles: number[];
}

/** Separates sha and subject in `git log --format=%H%x1f%s`. */
export const LOG_FIELD_SEP = "\x1f";
export const LOG_FORMAT = "%H%x1f%s";

/**
 * The commits a deploy covers: everything since the release tag before HEAD.
 * `prevTag` is `git describe --tags --abbrev=0 HEAD^` (null on a repo without
 * tags). Using the tag, not the push's `before`, means a push whose deploy
 * failed is still covered by the next one that goes live; the route closes
 * each ticket at most once per commit, so re-sending is harmless.
 */
export const shipRange = (prevTag: string | null): string => (prevTag ? `${prevTag}..HEAD` : "HEAD");

/** `git log --format=%H%x1f%s` output → the commits that name at least one ticket, oldest first. */
export function shippedCommits(log: string): ShippedCommit[] {
  const out: ShippedCommit[] = [];
  for (const line of log.split("\n")) {
    const at = line.indexOf(LOG_FIELD_SEP);
    if (at < 0) continue;
    const sha = line.slice(0, at).trim();
    const subject = line.slice(at + 1).trim();
    const handles = feedbackHandlesIn(subject);
    if (/^[0-9a-f]{7,40}$/i.test(sha) && handles.length) out.push({ sha, subject, handles });
  }
  return out;
}
