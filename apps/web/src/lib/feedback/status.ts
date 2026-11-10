import { FEEDBACK_AI_AUTHOR_NAME, FEEDBACK_RELEASE_AUTHOR_NAME, type FeedbackComment, type FeedbackStatus } from "@pt/shared";

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  accepted: "Accepted",
  done: "Done",
  wontfix: "Won't fix",
};

export const STATUS_TONE: Record<FeedbackStatus, "good" | "warn" | "bad" | "neutral"> = {
  new: "warn",
  accepted: "good",
  done: "neutral",
  wontfix: "neutral",
};

/**
 * Who a thread entry is from, for display: a release, the AI assistant, the
 * trainer, or "Someone" (a deleted trainer).
 */
export function entryAuthorName(c: Pick<FeedbackComment, "authorKind" | "author">): string {
  if (c.authorKind === "system") return FEEDBACK_RELEASE_AUTHOR_NAME;
  if (c.authorKind === "ai") return FEEDBACK_AI_AUTHOR_NAME;
  return c.author?.name ?? "Someone";
}

/**
 * A status line's parts: "<who> marked it <status> · <tail>". A release entry
 * always carries the version it shipped in; a person's Done entry shows the
 * item's `shippedIn` only when it is the latest Done and the item is still done.
 */
export function statusLine(
  c: Pick<FeedbackComment, "authorKind" | "author" | "status" | "ship">,
  shown: { latestDone: boolean; shippedIn: string | null },
): { who: string; status: string; tail: string | null } {
  const status = STATUS_LABEL[c.status ?? "done"];
  if (c.authorKind === "system" && c.ship) return { who: entryAuthorName(c), status, tail: `v${c.ship.version}` };
  const tail = c.status === "done" && shown.latestDone && shown.shippedIn ? `shipped in v${shown.shippedIn}` : null;
  return { who: entryAuthorName(c), status, tail };
}
