import { Elysia, t } from "elysia";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, exercises, kineticChains, sessionLogs, setLogs } from "@pt/db";
import { chainSetCounts, KineticChainInput } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { ensureSeededChains } from "../lib/chains";

function getWeekStart(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const chainRoutes = new Elysia({ prefix: "/v1/chains", tags: ["chains"] })
  .use(trainerContext)
  .get("/", async ({ trainerId }) => {
    const chains = await ensureSeededChains(trainerId);
    return { chains };
  })
  .get(
    "/week",
    async ({ query, trainerId }) => {
      const chains = await ensureSeededChains(trainerId);
      const weekStart = getWeekStart();

      const logs = await db
        .select()
        .from(sessionLogs)
        .where(and(eq(sessionLogs.clientId, query.clientId), gte(sessionLogs.date, weekStart)))
        .orderBy(desc(sessionLogs.date))
        .limit(200);

      const sets = logs.length
        ? await db
            .select()
            .from(setLogs)
            .where(inArray(setLogs.sessionLogId, logs.map((l) => l.id)))
        : [];

      const exerciseIds = Array.from(new Set(sets.map((s) => s.exerciseId)));
      const catalog = exerciseIds.length
        ? await db
            .select({
              id: exercises.id,
              primaryMuscleGroup: exercises.primaryMuscleGroup,
              secondaryMuscleGroups: exercises.secondaryMuscleGroups,
            })
            .from(exercises)
            .where(inArray(exercises.id, exerciseIds))
        : [];

      const structuredLogs = logs.map((l) => ({
        date: l.date,
        sets: sets
          .filter((s) => s.sessionLogId === l.id)
          .map((s) => ({
            exerciseId: s.exerciseId,
            type: s.type,
          })),
      }));

      const counts = chainSetCounts(chains, structuredLogs, catalog, weekStart);

      return {
        weekStart,
        chains: chains.map((c) => ({
          id: c.id,
          name: c.name,
          muscleGroups: c.muscleGroups,
          sets: counts[c.id] ?? 0,
        })),
      };
    },
    {
      query: t.Object({
        clientId: t.String({ format: "uuid" }),
      }),
    }
  )
  .put(
    "/:id",
    async ({ params, body, status, trainerId }) => {
      const parsed = KineticChainInput.safeParse(body);
      if (!parsed.success) {
        return status(422, {
          error: "invalid chain",
          issues: z.treeifyError(parsed.error),
        });
      }
      const [updated] = await db
        .update(kineticChains)
        .set({
          muscleGroups: parsed.data.muscleGroups,
          updatedAt: new Date(),
        })
        .where(and(eq(kineticChains.id, params.id), eq(kineticChains.trainerId, trainerId)))
        .returning();

      if (!updated) {
        return status(404, { error: "chain not found" });
      }
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Any(),
    }
  );
