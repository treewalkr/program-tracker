import { and, eq, sql } from "drizzle-orm";
import { db, feedbackItems, feedbackMutes, trainers } from "@pt/db";
import { feedbackEmailPrefs, feedbackHandle, FEEDBACK_REPLY_SCOPES, type FeedbackEmailPrefs, type FeedbackReplyScope } from "@pt/shared";
import { randomToken } from "./auth";

/**
 * Unsubscribe links in feedback emails. Each person has one random
 * `email_token` (made the first time they are emailed); a link is that token
 * plus a scope — everything, one kind of event, or one ticket.
 */

export type EmailEvent = "newTickets" | "replies" | "status";
const EVENTS: EmailEvent[] = ["newTickets", "replies", "status"];

export type UnsubscribeScope =
  | { kind: "all" }
  | { kind: "event"; event: EmailEvent }
  | { kind: "ticket"; itemId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScope(raw: string | undefined): UnsubscribeScope | null {
  if (raw === "all") return { kind: "all" };
  const [kind, value] = (raw ?? "").split(":", 2);
  if (kind === "event" && EVENTS.includes(value as EmailEvent)) return { kind: "event", event: value as EmailEvent };
  if (kind === "ticket" && UUID.test(value ?? "")) return { kind: "ticket", itemId: value.toLowerCase() };
  return null;
}

export const scopeParam = (s: UnsubscribeScope) =>
  s.kind === "all" ? "all" : s.kind === "event" ? `event:${s.event}` : `ticket:${s.itemId}`;

export const unsubscribeUrl = (appUrl: string, token: string, scope: UnsubscribeScope) =>
  `${appUrl}/v1/email/unsubscribe?t=${encodeURIComponent(token)}&scope=${encodeURIComponent(scopeParam(scope))}`;

/** The web origin emails link to; the Worker (prod) and Vite (dev) proxy /v1 to the API. */
export const appUrl = () =>
  (process.env.APP_URL ?? process.env.CORS_ORIGINS?.split(",")[0] ?? "http://localhost:5173").trim().replace(/\/+$/, "");

/** The trainer's link token, created on first use. */
export async function ensureEmailToken(trainerId: string): Promise<string> {
  await db
    .update(trainers)
    .set({ emailToken: randomToken() })
    .where(and(eq(trainers.id, trainerId), sql`${trainers.emailToken} is null`));
  const [row] = await db.select({ token: trainers.emailToken }).from(trainers).where(eq(trainers.id, trainerId));
  return row.token!;
}

/** New token: every link already sent stops working. */
export async function resetEmailToken(trainerId: string): Promise<string> {
  const token = randomToken();
  await db.update(trainers).set({ emailToken: token }).where(eq(trainers.id, trainerId));
  return token;
}

export interface LinkTarget {
  trainerId: string;
  prefs: FeedbackEmailPrefs;
  feedbackEmails: boolean;
  /** FB-012 for a ticket scope. */
  handle: string | null;
}

/** Who a token belongs to, and the ticket a ticket scope names — null when either is gone. */
export async function resolveLink(token: string | undefined, scope: UnsubscribeScope): Promise<LinkTarget | null> {
  if (!token) return null;
  const [who] = await db
    .select({ id: trainers.id, prefs: trainers.feedbackEmailPrefs, feedbackEmails: trainers.feedbackEmails })
    .from(trainers)
    .where(eq(trainers.emailToken, token));
  if (!who) return null;
  let handle: string | null = null;
  if (scope.kind === "ticket") {
    const [item] = await db.select({ number: feedbackItems.number }).from(feedbackItems).where(eq(feedbackItems.id, scope.itemId));
    if (!item) return null;
    handle = feedbackHandle(item.number);
  }
  return { trainerId: who.id, prefs: feedbackEmailPrefs(who.prefs), feedbackEmails: who.feedbackEmails, handle };
}

/**
 * Turn the scope's emails off — or back on (`undo`). Undoing a replies stop
 * restores `restoreReplies` (what it was before), defaulting to "all".
 */
export async function applyUnsubscribe(
  target: LinkTarget,
  scope: UnsubscribeScope,
  opts: { undo?: boolean; restoreReplies?: string } = {},
): Promise<void> {
  const on = !!opts.undo;
  if (scope.kind === "all") {
    await db.update(trainers).set({ feedbackEmails: on }).where(eq(trainers.id, target.trainerId));
  } else if (scope.kind === "event") {
    const restore = FEEDBACK_REPLY_SCOPES.includes(opts.restoreReplies as FeedbackReplyScope) && opts.restoreReplies !== "off"
      ? (opts.restoreReplies as FeedbackReplyScope)
      : "all";
    const prefs: FeedbackEmailPrefs = {
      ...target.prefs,
      ...(scope.event === "replies" ? { replies: on ? restore : "off" } : { [scope.event]: on }),
    };
    await db.update(trainers).set({ feedbackEmailPrefs: prefs }).where(eq(trainers.id, target.trainerId));
  } else if (on) {
    await db
      .delete(feedbackMutes)
      .where(and(eq(feedbackMutes.trainerId, target.trainerId), eq(feedbackMutes.itemId, scope.itemId)));
  } else {
    await db.insert(feedbackMutes).values({ trainerId: target.trainerId, itemId: scope.itemId }).onConflictDoNothing();
  }
}
