import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db, trainers } from "@pt/db";
import { trainerContext } from "../lib/trainer-context";

/** The signed-in trainer's own settings. Today: whether feedback emails reach them. */
export const accountRoutes = new Elysia({ prefix: "/v1/account", tags: ["account"] })
  .use(trainerContext)
  .get(
    "/notifications",
    async ({ trainerId }) => {
      const [row] = await db
        .select({ feedbackEmails: trainers.feedbackEmails })
        .from(trainers)
        .where(eq(trainers.id, trainerId));
      return { feedbackEmails: row?.feedbackEmails ?? true };
    },
    { detail: { summary: "Your email notification settings" } },
  )
  .patch(
    "/notifications",
    async ({ trainerId, body }) => {
      const [row] = await db
        .update(trainers)
        .set({ feedbackEmails: body.feedbackEmails })
        .where(eq(trainers.id, trainerId))
        .returning({ feedbackEmails: trainers.feedbackEmails });
      return { feedbackEmails: row.feedbackEmails };
    },
    {
      body: t.Object({ feedbackEmails: t.Boolean() }),
      detail: { summary: "Turn feedback emails on or off" },
    },
  );
