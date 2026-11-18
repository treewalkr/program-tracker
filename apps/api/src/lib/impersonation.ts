import { and, eq, isNull } from "drizzle-orm";
import { authSessions, db, feedbackComments, feedbackItems, impersonations, trainers, type ImpersonationEndReason } from "@pt/db";
import { FEEDBACK_VIEWED_NOTE, feedbackHandle } from "@pt/shared";
import { isAdminEmail, type ResolvedSession } from "./auth";
import { firstName } from "./trainer-context";

/**
 * "View as trainer": the admin opens the app as a trainer to see what they saw.
 * The admin keeps their own session; its `acting_*` columns point at the
 * trainer for VIEW_MS, and `trainerContext` does the rest. Read-only unless
 * Allow edits is on (EDITS_MS, never past the view's end). Every view is an
 * `impersonations` row; a view started from a ticket leaves one silent public
 * line in that ticket's thread — the only trace the trainer sees.
 */

export const VIEW_MS = 30 * 60_000;
export const EDITS_MS = 10 * 60_000;

export type StartFailure = { status: 404 | 409 | 422; error: string };

/** Close the session's open view (if any): clear the columns, stamp the audit row. */
async function closeView(session: ResolvedSession, by: ImpersonationEndReason, now = new Date()): Promise<void> {
  if (session.view?.impersonationId) {
    await db
      .update(impersonations)
      .set({ endedAt: now, endedBy: by })
      .where(and(eq(impersonations.id, session.view.impersonationId), isNull(impersonations.endedAt)));
  }
  await db
    .update(authSessions)
    .set({ actingAsTrainerId: null, actingUntil: null, actingWritesUntil: null, impersonationId: null })
    .where(eq(authSessions.id, session.sessionId));
}

/** Start viewing as a trainer. The caller has checked the admin and the flag. */
export async function startView(
  session: ResolvedSession,
  input: { trainerId: string; ticketId?: string; reason?: string },
  now = new Date(),
): Promise<{ returnTo: string; until: Date } | StartFailure> {
  const [target] = await db.select().from(trainers).where(eq(trainers.id, input.trainerId));
  if (!target) return { status: 404, error: "trainer not found" };
  if (target.id === session.actor.id || isAdminEmail(target.email)) return { status: 409, error: "you can't view your own account" };
  if (target.disabledAt) return { status: 409, error: `${firstName(target.name)}'s account is disabled` };

  let ticket: { id: string; route: string } | null = null;
  if (input.ticketId) {
    const [row] = await db
      .select({ id: feedbackItems.id, route: feedbackItems.route, trainerId: feedbackItems.trainerId })
      .from(feedbackItems)
      .where(eq(feedbackItems.id, input.ticketId));
    if (!row) return { status: 404, error: "ticket not found" };
    if (row.trainerId !== target.id) return { status: 422, error: "that ticket isn't from this trainer" };
    ticket = row;
  }

  if (session.view) await closeView(session, session.ended ?? "stop", now);
  const until = new Date(now.getTime() + VIEW_MS);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(impersonations)
      .values({ adminId: session.actor.id, trainerId: target.id, ticketId: ticket?.id ?? null, reason: input.reason?.trim() || null, startedAt: now })
      .returning({ id: impersonations.id });
    await tx
      .update(authSessions)
      .set({ actingAsTrainerId: target.id, actingUntil: until, actingWritesUntil: null, impersonationId: row.id })
      .where(eq(authSessions.id, session.sessionId));
    // The trainer's one trace: silent (no email, no unread badge), public, from no one in particular.
    if (ticket) {
      await tx.insert(feedbackComments).values({
        itemId: ticket.id,
        kind: "reply",
        authorKind: "system",
        body: FEEDBACK_VIEWED_NOTE,
        silent: true,
        createdAt: now,
      });
    }
  });
  return { returnTo: ticket ? appRoute(ticket.route) : "/", until };
}

/** A ticket's stored route as an in-app path; anything odd goes home. */
const appRoute = (route: string) => (route.startsWith("/") && !route.startsWith("//") ? route : "/");

/** Stop the session's view; where to go next (the ticket, else the admin console). */
export async function stopView(session: ResolvedSession): Promise<{ returnTo: string }> {
  const ticket = session.view?.ticket;
  if (session.view) await closeView(session, session.ended ?? "stop");
  return { returnTo: ticket ? `/feedback#${feedbackHandle(ticket.number)}` : "/admin" };
}

/** Allow edits for EDITS_MS, capped at the view's end. Needs the trainer's first name typed back. */
export async function allowEdits(
  session: ResolvedSession,
  confirm: string,
  now = new Date(),
): Promise<{ writesUntil: Date } | { status: 409 | 422; error: string }> {
  const view = session.view;
  if (!view || session.ended) return { status: 409, error: "not viewing as anyone" };
  const name = firstName(view.trainer.name);
  if (confirm.trim().toLocaleLowerCase() !== name.toLocaleLowerCase()) {
    return { status: 422, error: `type ${name} to allow edits` };
  }
  const writesUntil = new Date(Math.min(now.getTime() + EDITS_MS, view.until.getTime()));
  await db.update(authSessions).set({ actingWritesUntil: writesUntil }).where(eq(authSessions.id, session.sessionId));
  return { writesUntil };
}

/** Back to read-only. */
export async function lockEdits(session: ResolvedSession): Promise<void> {
  await db.update(authSessions).set({ actingWritesUntil: null }).where(eq(authSessions.id, session.sessionId));
}

/** What `GET /v1/auth/me` says about a view; null when the session isn't viewing as anyone. */
export function impersonatorOf(session: ResolvedSession, now = new Date()) {
  const view = session.view;
  if (!view) return null;
  const { actor } = session;
  return {
    actor: { id: actor.id, name: actor.name, email: actor.email, avatarUrl: actor.avatarUrl },
    trainer: view.trainer,
    ticket: view.ticket ? { id: view.ticket.id, number: view.ticket.number, handle: feedbackHandle(view.ticket.number) } : null,
    until: view.until.toISOString(),
    writesUntil: view.writesUntil && view.writesUntil > now && !session.ended ? view.writesUntil.toISOString() : null,
    /** null while live; else why the view stopped applying — the banner says so and offers to close it. */
    ended: session.ended,
  };
}
