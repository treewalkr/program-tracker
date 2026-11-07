import { and, eq, inArray } from "drizzle-orm";
import { db, feedbackComments, feedbackItems, feedbackMutes, trainers } from "@pt/db";
import { feedbackEmailPrefs, feedbackHandle, type FeedbackEmailPrefs, type FeedbackStatus } from "@pt/shared";
import { adminEmailFromEnv } from "./auth";
import { appUrl, ensureEmailToken, unsubscribeUrl, type EmailEvent, type UnsubscribeScope } from "./email-links";
import { emailConfigured, sendEmail, type Email } from "./mailer";

/**
 * Feedback emails. Policy (who hears about what) is the pure `feedbackEmails`;
 * `notifyFeedback` loads the facts and sends, fire-and-forget after commit.
 *
 * - created → the admin (unless the admin filed it)
 * - reply   → everyone on the thread (reporter, admin, other repliers) but the author
 * - status  → the reporter, for accepted / won't fix / done (unless they made the change)
 * Nobody hears about their own actions. On top of that each person's own say:
 * `feedback_emails = false` silences everything, a muted ticket silences that
 * ticket, and the prefs turn off one kind of event (replies can also be
 * narrowed to "mine" — tickets the person filed, replied on or moved).
 */

export type FeedbackEvent =
  | { kind: "created"; itemId: string }
  | { kind: "reply"; itemId: string; commentId: string }
  | { kind: "status"; itemId: string; commentId: string };

export interface Person {
  id: string;
  name: string;
  email: string;
  /** Master switch. */
  feedbackEmails: boolean;
  prefs: FeedbackEmailPrefs;
  /** Muted this event's ticket. */
  muted: boolean;
  /** Filed this ticket, replied on it or changed its status. */
  inTicket: boolean;
  /** Secret for their unsubscribe links; null = not made yet (links left out). */
  token: string | null;
}

export interface FeedbackSnapshot {
  item: {
    id: string;
    number: number;
    comment: string;
    route: string;
    triageNote: string | null;
    shippedIn: string | null;
  };
  reporter: Person | null;
  admin: Person | null;
  /** Authors of replies on the thread, any order. */
  repliers: Person[];
  /** Who caused the event: the reporter for created, the comment's author otherwise. */
  actor: Person | null;
  /** The reply or status entry behind a reply/status event. */
  comment: { body: string | null; status: FeedbackStatus | null } | null;
  appUrl: string;
}

const EMAILED_STATUSES: FeedbackStatus[] = ["accepted", "wontfix", "done"];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const EVENT_PREF: Record<FeedbackEvent["kind"], { pref: EmailEvent; label: string }> = {
  created: { pref: "newTickets", label: "new-ticket" },
  reply: { pref: "replies", label: "reply" },
  status: { pref: "status", label: "status" },
};

interface Parts {
  lead: string;
  quote?: string;
  after?: string;
}

/** Plain text and matching minimal HTML for one recipient — the links carry their token. */
function compose(snap: FeedbackSnapshot, kind: FeedbackEvent["kind"], to: Person, subject: string, parts: Parts): Email {
  const handle = feedbackHandle(snap.item.number);
  const link = `${snap.appUrl}/feedback#${handle}`;
  const settings = `${snap.appUrl}/settings`;
  const unsub = (scope: UnsubscribeScope) => (to.token ? unsubscribeUrl(snap.appUrl, to.token, scope) : null);
  const footer = [
    { label: `Mute ${handle}`, href: unsub({ kind: "ticket", itemId: snap.item.id }) },
    { label: `Stop ${EVENT_PREF[kind].label} emails`, href: unsub({ kind: "event", event: EVENT_PREF[kind].pref }) },
    { label: "Unsubscribe from all", href: unsub({ kind: "all" }) },
    { label: "Manage in Settings", href: settings },
  ].filter((l): l is { label: string; href: string } => l.href !== null);
  const text = [
    parts.lead,
    ...(parts.quote ? ["", ...parts.quote.split("\n").map((l) => `  ${l}`)] : []),
    ...(parts.after ? ["", parts.after] : []),
    "",
    `Open ${handle}: ${link}`,
    "",
    "—",
    "Program Tracker feedback.",
    ...footer.map((l) => `${l.label}: ${l.href}`),
  ].join("\n");
  const muted = "color:#656d76";
  const html = [
    `<div style="font:14px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2328;max-width:560px">`,
    `<p style="margin:0 0 12px">${esc(parts.lead)}</p>`,
    parts.quote
      ? `<blockquote style="margin:0 0 12px;padding:2px 0 2px 12px;border-left:3px solid #d0d7de;white-space:pre-wrap">${esc(parts.quote)}</blockquote>`
      : "",
    parts.after ? `<p style="margin:0 0 12px;white-space:pre-wrap">${esc(parts.after)}</p>` : "",
    `<p style="margin:16px 0"><a href="${esc(link)}" style="display:inline-block;padding:6px 14px;border-radius:6px;background:#1f883d;color:#fff;text-decoration:none;font-weight:600">Open ${handle}</a></p>`,
    `<p style="margin:24px 0 0;font-size:12px;${muted}">Program Tracker feedback · ${footer
      .map((l) => `<a href="${esc(l.href)}" style="${muted}">${esc(l.label)}</a>`)
      .join(" · ")}</p>`,
    `</div>`,
  ].join("");
  const all = unsub({ kind: "all" });
  const headers = all ? { "List-Unsubscribe": `<${all}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  return { to: to.email, subject, text, html, ...(headers ? { headers } : {}) };
}

/** Who hears about an event, once each. Pure. */
export function feedbackRecipients(kind: FeedbackEvent["kind"], snap: FeedbackSnapshot): Person[] {
  const { actor } = snap;
  const wants = (p: Person): boolean => {
    if (!p.feedbackEmails || p.muted) return false;
    if (kind === "created") return p.prefs.newTickets;
    if (kind === "reply") return p.prefs.replies === "all" || (p.prefs.replies === "mine" && p.inTicket);
    return p.prefs.status;
  };
  const seen = new Set<string>();
  const filter = (people: (Person | null)[]) =>
    people.filter((p): p is Person => {
      if (!p || p.id === actor?.id || !wants(p)) return false;
      const key = p.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (kind === "created") return filter([snap.admin]);
  if (kind === "reply") return filter([snap.reporter, snap.admin, ...snap.repliers]);
  const status = snap.comment?.status;
  return status && EMAILED_STATUSES.includes(status) ? filter([snap.reporter]) : [];
}

/** Who gets which email for an event. Pure — no DB, no network. */
export function feedbackEmails(kind: FeedbackEvent["kind"], snap: FeedbackSnapshot): Email[] {
  const handle = feedbackHandle(snap.item.number);
  const { item, actor } = snap;
  const actorName = actor?.name ?? "Someone";
  const send = (subject: string, parts: Parts) =>
    feedbackRecipients(kind, snap).map((p) => compose(snap, kind, p, subject, parts));

  if (kind === "created") {
    return send(`[${handle}] New feedback from ${actorName}: "${clip(item.comment, 60)}"`, {
      lead: item.route ? `${actorName} left feedback on ${item.route}:` : `${actorName} filed a ticket:`,
      quote: item.comment.trim(),
    });
  }

  if (kind === "reply") {
    return send(`[${handle}] ${actorName} replied`, {
      lead: `${actorName} replied on ${handle} ("${clip(item.comment, 80)}"):`,
      quote: snap.comment?.body?.trim() ?? "",
    });
  }

  const quote = item.comment.trim();
  const status = snap.comment?.status;
  if (status === "accepted") {
    return send(`[${handle}] Accepted — on the build list`, {
      lead: `${actorName} accepted your feedback:`,
      quote,
      after: "It's on the build list. You'll get another email when it ships.",
    });
  }
  if (status === "wontfix") {
    return send(`[${handle}] Won't fix`, {
      lead: `${actorName} decided not to change this:`,
      quote,
      after: item.triageNote ? `Reason: ${item.triageNote}` : "Reply on the item if you want to talk it through.",
    });
  }
  if (status !== "done") return [];
  const version = item.shippedIn ? `v${item.shippedIn}` : null;
  return send(version ? `[${handle}] Shipped in ${version}` : `[${handle}] Done`, {
    lead: version ? `Your feedback shipped in ${version}:` : `${actorName} marked your feedback done:`,
    quote,
    after: "Thanks for pointing it out. Reload the app to get the latest version.",
  });
}

const personColumns = {
  id: trainers.id,
  name: trainers.name,
  email: trainers.email,
  feedbackEmails: trainers.feedbackEmails,
  prefs: trainers.feedbackEmailPrefs,
  token: trainers.emailToken,
};

async function snapshot(event: FeedbackEvent): Promise<FeedbackSnapshot | null> {
  const [item] = await db
    .select({
      id: feedbackItems.id,
      number: feedbackItems.number,
      comment: feedbackItems.comment,
      route: feedbackItems.route,
      triageNote: feedbackItems.triageNote,
      shippedIn: feedbackItems.shippedIn,
      trainerId: feedbackItems.trainerId,
    })
    .from(feedbackItems)
    .where(eq(feedbackItems.id, event.itemId));
  if (!item) return null;

  const thread = await db
    .select({ id: feedbackComments.id, trainerId: feedbackComments.trainerId, kind: feedbackComments.kind, body: feedbackComments.body, status: feedbackComments.status })
    .from(feedbackComments)
    .where(eq(feedbackComments.itemId, event.itemId));
  const comment = "commentId" in event ? (thread.find((c) => c.id === event.commentId) ?? null) : null;

  const adminEmail = adminEmailFromEnv();
  const ids = new Set<string>();
  if (item.trainerId) ids.add(item.trainerId);
  for (const c of thread) if (c.trainerId) ids.add(c.trainerId);
  const rows = ids.size ? await db.select(personColumns).from(trainers).where(inArray(trainers.id, [...ids])) : [];
  if (adminEmail && !rows.some((p) => p.email.toLowerCase() === adminEmail)) {
    rows.push(...(await db.select(personColumns).from(trainers).where(eq(trainers.email, adminEmail))));
  }
  const muted = rows.length
    ? new Set(
        (
          await db
            .select({ trainerId: feedbackMutes.trainerId })
            .from(feedbackMutes)
            .where(and(eq(feedbackMutes.itemId, event.itemId), inArray(feedbackMutes.trainerId, rows.map((p) => p.id))))
        ).map((m) => m.trainerId),
      )
    : new Set<string>();
  const people: Person[] = rows.map((p) => ({
    ...p,
    prefs: feedbackEmailPrefs(p.prefs),
    muted: muted.has(p.id),
    inTicket: ids.has(p.id),
  }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const admin = adminEmail ? (people.find((p) => p.email.toLowerCase() === adminEmail) ?? null) : null;

  const reporter = item.trainerId ? (byId.get(item.trainerId) ?? null) : null;
  const actorId = event.kind === "created" ? item.trainerId : comment?.trainerId;
  return {
    item,
    reporter,
    admin,
    repliers: thread.filter((c) => c.kind === "reply" && c.trainerId).map((c) => byId.get(c.trainerId!)!).filter(Boolean),
    actor: actorId ? (byId.get(actorId) ?? null) : null,
    comment: comment ? { body: comment.body, status: comment.status } : null,
    appUrl: appUrl(),
  };
}

const inFlight = new Set<Promise<void>>();

/**
 * Fire-and-forget: call after the DB commit, never await in a request. With
 * email unconfigured this returns at once without touching the DB.
 */
export function notifyFeedback(event: FeedbackEvent): void {
  if (!emailConfigured()) return;
  const run = (async () => {
    const snap = await snapshot(event);
    if (!snap) return;
    // links need each recipient's token: make any missing ones first
    for (const p of feedbackRecipients(event.kind, snap)) p.token ??= await ensureEmailToken(p.id);
    for (const email of feedbackEmails(event.kind, snap)) await sendEmail(email);
  })()
    .catch((err) => console.error(`email: feedback ${event.kind} notify failed — ${(err as Error).message}`))
    .finally(() => inFlight.delete(run));
  inFlight.add(run);
}

/** Tests: wait for every pending notification to finish. */
export async function settleFeedbackNotifications(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}
