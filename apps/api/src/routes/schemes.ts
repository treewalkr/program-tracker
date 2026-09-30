import { Elysia, t } from "elysia";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, periodizationSchemes } from "@pt/db";
import { PeriodizationSchemeInput } from "@pt/shared";
import { getDefaultTrainerId } from "../lib/trainer";

export const schemeRoutes = new Elysia({ prefix: "/v1/schemes" })
  .get("/", async () => {
    const trainerId = await getDefaultTrainerId();
    const rows = await db
      .select()
      .from(periodizationSchemes)
      .where(eq(periodizationSchemes.trainerId, trainerId))
      .orderBy(asc(periodizationSchemes.createdAt));
    return { schemes: rows };
  })
  .post(
    "/",
    async ({ body, status }) => {
      const parsed = PeriodizationSchemeInput.safeParse(body);
      if (!parsed.success) {
        return status(422, { error: "invalid scheme", issues: z.treeifyError(parsed.error) });
      }
      const trainerId = await getDefaultTrainerId();
      const [created] = await db
        .insert(periodizationSchemes)
        .values({ trainerId, name: parsed.data.name, weeks: parsed.data.weeks })
        .returning();
      return status(201, created);
    },
    { body: t.Any() }
  )
  /** Deleting a scheme never touches programs — they carry their own phasing copy. */
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [deleted] = await db
        .delete(periodizationSchemes)
        .where(eq(periodizationSchemes.id, params.id))
        .returning();
      if (!deleted) return status(404, { error: "scheme not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String() }) }
  );
