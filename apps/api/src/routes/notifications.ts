import { Elysia, t } from "elysia";
import { db, signalSnoozes } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";
import { openSignals } from "../lib/signals-service";

export const notificationRoutes = new Elysia({ prefix: "/v1/notifications", tags: ["notifications"] })
  .use(trainerContext)
  /**
   * Signals are derived state — computed on read by the shared rule engine,
   * never stored as truth. Snoozed rows (until in the future) are filtered out.
   */
  .get("/", async ({ trainerId }) => ({ signals: await openSignals(trainerId) }))
  .put(
    "/:signalId/snooze",
    async ({ params, body, status, trainerId }) => {
      const until = new Date(body.until);
      if (Number.isNaN(until.getTime())) {
        return status(422, { error: "until must be an ISO timestamp" });
      }
      await db
        .insert(signalSnoozes)
        .values({ signalId: params.signalId, trainerId, snoozedUntil: until })
        .onConflictDoUpdate({
          target: [signalSnoozes.signalId, signalSnoozes.trainerId],
          set: { snoozedUntil: until },
        });
      return { ok: true };
    },
    {
      params: t.Object({ signalId: t.String() }),
      body: t.Object({ until: t.String() }),
    }
  );
