import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, signalSnoozes } from "@pt/db";
import { getDefaultTrainerId } from "../lib/trainer";
import { computeTrainerSignals } from "../lib/signals-service";

export const notificationRoutes = new Elysia({ prefix: "/v1/notifications", tags: ["notifications"] })
  /**
   * Signals are derived state — computed on read by the shared rule engine,
   * never stored as truth. Snoozed rows (until in the future) are filtered out.
   */
  .get("/", async () => {
    const trainerId = await getDefaultTrainerId();
    const signals = await computeTrainerSignals(trainerId);
    const snoozed = await db
      .select()
      .from(signalSnoozes)
      .where(eq(signalSnoozes.trainerId, trainerId));
    const now = Date.now();
    const hidden = new Set(
      snoozed.filter((s) => s.snoozedUntil.getTime() > now).map((s) => s.signalId)
    );
    return { signals: signals.filter((s) => !hidden.has(s.id)) };
  })
  .put(
    "/:signalId/snooze",
    async ({ params, body, status }) => {
      const trainerId = await getDefaultTrainerId();
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
