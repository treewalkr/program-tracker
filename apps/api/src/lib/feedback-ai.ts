import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, trainers } from "@pt/db";
import {
  currentAiNote,
  feedbackHandle,
  ticketBasis,
  DEFAULT_FEEDBACK_AI_MODE,
  FEEDBACK_AI_AUTO_VERDICTS,
  type FeedbackAiConfidence,
  type FeedbackAiMode,
  type FeedbackAiVerdict,
  type FeedbackComment,
  type FeedbackItem,
} from "@pt/shared";
import { adminEmailFromEnv, authDisabled } from "./auth";
import { getDefaultTrainerId } from "./trainer";

/**
 * The feedback auto-reply agent. It runs off-server (a scheduled coding agent
 * on the owner's machine) and talks to `/v1/agent/feedback` with a bearer
 * token. Policy lives here, pure where it can be:
 *
 * - inbox: open tickets where the reporter spoke last (a reply, or an edit
 *   of their ticket) and the agent hasn't answered this version of it yet
 * - send vs draft: only auto mode, high confidence, an "it already works"
 *   verdict, and at most one AI answer per reporter message goes out alone
 */

/** The admin's trainer id: ADMIN_EMAIL's row, or with auth off the oldest trainer (who acts as admin). */
export async function adminTrainerId(): Promise<string | null> {
  const email = adminEmailFromEnv();
  if (email) {
    const [row] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.email, email));
    if (row) return row.id;
  }
  return authDisabled() ? getDefaultTrainerId() : null;
}

/** The admin's AI-answers setting — nobody else's is read. No admin row yet → the default. */
export async function feedbackAiMode(): Promise<FeedbackAiMode> {
  const id = await adminTrainerId();
  if (!id) return DEFAULT_FEEDBACK_AI_MODE;
  const [row] = await db.select({ mode: trainers.feedbackAiMode }).from(trainers).where(eq(trainers.id, id));
  return row?.mode ?? DEFAULT_FEEDBACK_AI_MODE;
}

/**
 * Constant-time check of an `Authorization: Bearer …` header against
 * FEEDBACK_AGENT_TOKEN. Hashing both sides first gives equal-length buffers,
 * so neither the token nor its length leaks through timing. Unset → never.
 */
export function agentTokenMatches(header: string | undefined | null, expected = process.env.FEEDBACK_AGENT_TOKEN): boolean {
  if (!expected) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(m[1].trim()), digest(expected));
}

const OPEN = new Set(["new", "accepted"]);
const publicReplies = (thread: FeedbackComment[]) =>
  thread.filter((c) => c.kind === "reply" && c.visibility === "public");
const byReporter = (item: FeedbackItem, c: FeedbackComment) =>
  c.authorKind === "human" && item.author !== null && c.author?.id === item.author.id;

/**
 * When the reporter last edited their own ticket, or null. Such an edit is
 * their latest word, like a reply; the admin's edits are not.
 */
const reporterEditedAt = (item: FeedbackItem): string | null =>
  item.editedAt && item.author !== null && item.editedBy?.id === item.author.id ? item.editedAt : null;

/**
 * Whether the agent should look at this ticket now. Pure; expects the admin
 * view (drafts included). The reporter spoke last — by a reply, or by editing
 * the ticket after the last answer — and nothing was answered for this version.
 */
export function needsAnswer(item: FeedbackItem): boolean {
  if (!OPEN.has(item.status)) return false;
  const last = publicReplies(item.thread).at(-1);
  const edited = reporterEditedAt(item);
  if (last && !byReporter(item, last) && !(edited && edited > last.createdAt)) return false;
  const basis = ticketBasis(item);
  return !item.thread.some((c) => c.authorKind === "ai" && c.aiMeta?.basis === basis);
}

/** Has an AI answer gone out since the reporter last wrote — replied, edited the ticket, or filed it? */
export function aiRepliedSinceReporter(item: FeedbackItem): boolean {
  const replies = publicReplies(item.thread);
  const from = replies.findLastIndex((c) => byReporter(item, c));
  const edited = reporterEditedAt(item);
  return replies.slice(from + 1).some((c) => c.authorKind === "ai" && !(edited && c.createdAt < edited));
}

export type AnswerOutcome = "sent" | "drafted";

/** Send the reply on its own, or leave it as a draft for the admin. Pure. */
export function routeAnswer(
  mode: FeedbackAiMode,
  answer: { verdict: FeedbackAiVerdict; confidence: FeedbackAiConfidence },
  item: FeedbackItem,
): AnswerOutcome {
  const confident =
    mode === "auto" && answer.confidence === "high" && FEEDBACK_AI_AUTO_VERDICTS.includes(answer.verdict);
  return confident && !aiRepliedSinceReporter(item) ? "sent" : "drafted";
}

/** Verdicts the fix agent may take: something to change in the code. */
const FIXABLE_VERDICTS = new Set(["bug", "feature"]);

export type FixCandidate = { ok: true } | { ok: false; reason: string };

/**
 * May the fix agent take this ticket? Pure; expects the admin view. Only an
 * accepted ticket that isn't a duplicate, whose current AI note (same basis —
 * an edit since makes it stale) calls it a bug or feature with a ready,
 * low-risk fix plan. A recorded PR is the caller's to check: it may be
 * closed, and then the ticket is fair game again.
 */
export function fixCandidate(item: FeedbackItem): FixCandidate {
  const no = (reason: string): FixCandidate => ({ ok: false, reason });
  if (item.status !== "accepted") return no(`status ${item.status}`);
  if (item.duplicateOf) return no(`duplicate of ${feedbackHandle(item.duplicateOf.number)}`);
  const note = currentAiNote(item);
  if (!note) return no("no current AI note");
  const m = note.aiMeta;
  if (!FIXABLE_VERDICTS.has(m.verdict)) return no(`verdict ${m.verdict}`);
  if (m.risk !== "low") return no(`risk ${m.risk ?? "unrated"}`);
  if (!m.fixPlan?.length) return no("no fix plan");
  if (m.ready !== true) return no("not ready");
  return { ok: true };
}

/**
 * Fingerprint of the inbox: which tickets wait, at which version. It changes
 * exactly when there's new work (a new ticket, a reporter's reply or edit),
 * so a watcher can start the agent once per change. Empty inbox → "".
 */
export function inboxCursor(entries: { id: string; basis: string }[]): string {
  if (!entries.length) return "";
  const text = entries.map((e) => `${e.id}:${e.basis}`).sort().join(",");
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
