import { Elysia, t } from "elysia";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db, exercises } from "@pt/db";
import { getDefaultTrainerId } from "../lib/trainer";

export const exerciseRoutes = new Elysia({ prefix: "/v1/exercises", tags: ["exercises"] })
  /** Search the seed library + this trainer's custom exercises. */
  .get(
    "/",
    async ({ query }) => {
      const trainerId = await getDefaultTrainerId();
      const scope = or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId))!;
      const rows = query.q
        ? await db
            .select()
            .from(exercises)
            .where(and(scope, ilike(exercises.name, `%${query.q}%`)))
            .limit(50)
        : await db.select().from(exercises).where(scope).limit(50);
      return rows;
    },
    { query: t.Object({ q: t.Optional(t.String({ maxLength: 100 })) }) }
  )
  .post(
    "/",
    async ({ body, status }) => {
      const trainerId = await getDefaultTrainerId();
      const [created] = await db
        .insert(exercises)
        .values({ ...body, trainerId })
        .returning();
      return status(201, created);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        primaryMuscleGroup: t.String(),
        secondaryMuscleGroups: t.Optional(t.Array(t.String(), { maxItems: 4 })),
        equipment: t.String(),
      }),
    }
  );
