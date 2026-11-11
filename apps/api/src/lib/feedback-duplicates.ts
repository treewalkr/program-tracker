import { and, asc, eq, inArray } from "drizzle-orm";
import { db, feedbackComments, feedbackItems } from "@pt/db";
import {
  OPEN_FEEDBACK_STATUSES,
  feedbackHandle,
  isOpenFeedback,
  type FeedbackAuthorKind,
  type FeedbackShip,
  type FeedbackStatus,
} from "@pt/shared";

/**
 * Duplicate tickets: FB-014 "repeats" the open FB-012, and closes with it.
 * One level only — an original is never itself a duplicate — so closing an
 * original reaches every ticket that repeats it in one step.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LinkResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: 404 | 409 | 422; error: string };

const fail = (status: 404 | 409 | 422, error: string): LinkResult => ({ ok: false, status, error });

/**
 * Mark ticket `itemId` as a duplicate of ticket number `of`. Both must be
 * open; the original may not be a duplicate itself, and a ticket others
 * repeat can't become a duplicate (no chains). Re-linking to the same
 * original is a no-op; linking to another one moves the link.
 */
export async function linkDuplicate(itemId: string, of: number): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: feedbackItems.id, number: feedbackItems.number, status: feedbackItems.status, duplicateOf: feedbackItems.duplicateOf })
      .from(feedbackItems)
      .where(eq(feedbackItems.id, itemId))
      .for("update");
    if (!item) return fail(404, "feedback not found");
    const [orig] = await tx
      .select({ id: feedbackItems.id, number: feedbackItems.number, status: feedbackItems.status, duplicateOf: feedbackItems.duplicateOf })
      .from(feedbackItems)
      .where(eq(feedbackItems.number, of))
      .for("update");
    const handle = feedbackHandle(item.number);
    const origHandle = feedbackHandle(of);
    if (!orig) return fail(404, `${origHandle} doesn't exist`);
    if (orig.id === item.id) return fail(422, `${handle} can't be a duplicate of itself`);
    if (!isOpenFeedback(item.status)) return fail(409, `${handle} is closed — only open tickets can be marked as duplicates`);
    if (!isOpenFeedback(orig.status)) return fail(409, `${origHandle} is closed — link to an open ticket`);
    if (orig.duplicateOf) {
      const [root] = await tx.select({ number: feedbackItems.number }).from(feedbackItems).where(eq(feedbackItems.id, orig.duplicateOf));
      return fail(409, `${origHandle} is itself a duplicate${root ? ` of ${feedbackHandle(root.number)} — link to that one` : ""}`);
    }
    const repeats = await tx
      .select({ number: feedbackItems.number })
      .from(feedbackItems)
      .where(eq(feedbackItems.duplicateOf, item.id))
      .orderBy(asc(feedbackItems.number));
    if (repeats.length) {
      return fail(409, `${handle} has its own duplicates (${repeats.map((r) => feedbackHandle(r.number)).join(", ")}) — unlink them first`);
    }
    if (item.duplicateOf === orig.id) return { ok: true, changed: false };
    await tx.update(feedbackItems).set({ duplicateOf: orig.id, updatedAt: new Date() }).where(eq(feedbackItems.id, item.id));
    return { ok: true, changed: true };
  });
}

/** Clear ticket `itemId`'s duplicate link, whatever its status. False when it doesn't exist. */
export async function unlinkDuplicate(itemId: string): Promise<boolean> {
  const rows = await db
    .update(feedbackItems)
    .set({ duplicateOf: null, updatedAt: new Date() })
    .where(eq(feedbackItems.id, itemId))
    .returning({ id: feedbackItems.id });
  return rows.length > 0;
}

/** How an original closed — its duplicates close the same way. */
export interface CloseWith {
  status: Extract<FeedbackStatus, "done" | "wontfix">;
  shippedIn: string | null;
  /** Who closed it: the admin's id, or null for a release. */
  trainerId: string | null;
  authorKind: FeedbackAuthorKind;
  /** A release: recorded on each duplicate's status entry, like on the original's. */
  ship?: FeedbackShip;
  /** A public note after the status entry, worded from the duplicate's own comment (the release's "Shipped in …"). */
  note?: (comment: string) => string;
  /** Won't fix: the reason the admin gave, posted on each duplicate too. */
  reason?: string | null;
  /** Thread time of the first entry written, ms. */
  at: number;
}

/** A duplicate closed with its original: what its reporter's status email needs. */
export interface ClosedDuplicate {
  itemId: string;
  number: number;
  statusId: string;
  reasonId: string | null;
}

/**
 * Close the open tickets that repeat `originalId`, inside the transaction
 * that closed it. Each gets what the original got — the reason reply, a
 * status entry, the release note — so its reporter's thread and email read
 * the same. Closed duplicates are left as they are.
 */
export async function closeDuplicates(tx: Tx, originalId: string, w: CloseWith): Promise<ClosedDuplicate[]> {
  const dups = await tx
    .select({ id: feedbackItems.id, number: feedbackItems.number, comment: feedbackItems.comment })
    .from(feedbackItems)
    .where(and(eq(feedbackItems.duplicateOf, originalId), inArray(feedbackItems.status, [...OPEN_FEEDBACK_STATUSES])))
    .orderBy(asc(feedbackItems.number))
    .for("update");
  const out: ClosedDuplicate[] = [];
  for (const d of dups) {
    await tx
      .update(feedbackItems)
      .set({ status: w.status, shippedIn: w.shippedIn, updatedAt: new Date(w.at) })
      .where(eq(feedbackItems.id, d.id));
    const by = { itemId: d.id, trainerId: w.trainerId, authorKind: w.authorKind };
    const reason = w.reason?.trim();
    const [why] = reason
      ? await tx
          .insert(feedbackComments)
          .values({ ...by, kind: "reply", body: reason, createdAt: new Date(w.at) })
          .returning({ id: feedbackComments.id })
      : [];
    // Explicit, increasing times so each thread reads reason → status → note.
    const [entry] = await tx
      .insert(feedbackComments)
      .values({ ...by, kind: "status", status: w.status, ship: w.ship ?? null, createdAt: new Date(w.at + 1) })
      .returning({ id: feedbackComments.id });
    if (w.note) {
      await tx
        .insert(feedbackComments)
        .values({ ...by, kind: "reply", body: w.note(d.comment), ship: w.ship ?? null, createdAt: new Date(w.at + 2) });
    }
    out.push({ itemId: d.id, number: d.number, statusId: entry.id, reasonId: why?.id ?? null });
  }
  return out;
}
