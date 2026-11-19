import { Elysia, StatusMap } from "elysia";
import { db, impersonationWrites } from "@pt/db";
import { SESSION_COOKIE, authDisabled, resolveSession, viewWritable } from "./auth";
import { foreignReference } from "./ownership";
import { getDefaultTrainerId } from "./trainer";

/** A live "view as trainer" on this request. */
export interface Impersonating {
  /** The trainer whose account is being viewed (= `trainerId`). */
  trainerId: string;
  trainerName: string;
  impersonationId: string | null;
  ticketId: string | null;
  until: Date;
  /** Allow edits is on: writes go through and are recorded. */
  writable: boolean;
}

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
export const isWrite = (method: string) => !READS.has(method.toUpperCase());

/** Requests made during a view with Allow edits on, for the write record. */
const unlockedViews = new WeakMap<Request, Impersonating>();

/** "Kai Tan" → "Kai" — what the read-only message and the Allow-edits confirm use. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Who is calling. Every route module `.use()`s this so handlers get a typed
 * `trainerId`; Elysia dedupes it, so it runs once per request.
 *
 * - no live session → 401
 * - any id in the request owned by another trainer → 404
 * - the admin viewing as a trainer: `trainerId` is that trainer, `actorId` the
 *   admin, `isAdmin` false (they see the trainer's app), and writes answer 403
 *   unless Allow edits is on — then each one is recorded in `impersonation_writes`.
 *   The view's stop / allow-edits / lock routes live under /v1/auth, outside this guard.
 *
 * AUTH_DISABLED=true (tests, local hacking) acts as the oldest trainer, as admin.
 */
export const trainerContext = new Elysia({ name: "trainer-context" })
  .resolve({ as: "scoped" }, async ({ cookie, status, route, params, query, body, request }) => {
    let trainerId: string;
    let actorId: string;
    let isAdmin: boolean;
    let impersonating: Impersonating | null = null;
    if (authDisabled()) {
      trainerId = actorId = await getDefaultTrainerId();
      isAdmin = true;
    } else {
      const session = await resolveSession(cookie[SESSION_COOKIE]?.value as string | undefined);
      if (!session) return status(401, { error: "signed out" });
      actorId = session.actor.id;
      if (session.view && !session.ended) {
        const { view } = session;
        trainerId = view.trainer.id;
        isAdmin = false;
        impersonating = {
          trainerId,
          trainerName: view.trainer.name,
          impersonationId: view.impersonationId,
          ticketId: view.ticket?.id ?? null,
          until: view.until,
          writable: viewWritable(view),
        };
        if (impersonating.writable) unlockedViews.set(request, impersonating);
        if (isWrite(request.method) && !impersonating.writable) {
          return status(403, { error: `read-only while viewing as ${firstName(view.trainer.name)}` });
        }
      } else {
        trainerId = session.actor.id;
        isAdmin = session.actor.isAdmin;
      }
    }
    const missing = await foreignReference(trainerId, { route, params, query, body });
    if (missing) return status(404, { error: missing });
    return { trainerId, actorId, isAdmin, impersonating };
  })
  // Allow edits: every write made during the view is recorded — what and when, never the body.
  .onAfterResponse({ as: "scoped" }, (ctx) => {
    // from the map, not ctx: a write the guard itself refused (a foreign id → 404) is recorded too
    const acting = unlockedViews.get(ctx.request);
    if (!acting?.writable || !acting.impersonationId || !ctx.route || !isWrite(ctx.request.method)) return;
    const raw = ctx.set.status;
    const code = typeof raw === "number" ? raw : ((raw && StatusMap[raw as keyof typeof StatusMap]) ?? 200);
    const p = db
      .insert(impersonationWrites)
      .values({ impersonationId: acting.impersonationId, method: ctx.request.method, route: ctx.route, status: code })
      .then(() => undefined)
      .catch((err) => console.error(`impersonation write log: ${(err as Error).message}`))
      .finally(() => inFlight.delete(p));
    inFlight.add(p);
  });

const inFlight = new Set<Promise<void>>();
/** Tests: wait for the write records started so far (after-response hooks run after the response). */
export async function settleImpersonationWrites(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  while (inFlight.size) await Promise.all([...inFlight]);
}
