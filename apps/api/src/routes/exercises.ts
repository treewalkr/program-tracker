import { Elysia, t } from "elysia";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, exercises } from "@pt/db";
import { FunctionalMovement, MovementPattern } from "@pt/shared";
import { getDefaultTrainerId } from "../lib/trainer";

function parseMovementPattern(
  raw: unknown
): { ok: true; value: MovementPattern | null | undefined } | { ok: false; issues: unknown } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  const parsed = MovementPattern.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: z.treeifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

function parseFunctionalMovement(
  raw: unknown
): { ok: true; value: FunctionalMovement | null | undefined } | { ok: false; issues: unknown } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  const parsed = FunctionalMovement.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: z.treeifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}

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
            .limit(1000)
        : await db.select().from(exercises).where(scope).limit(1000);
      return rows;
    },
    { query: t.Object({ q: t.Optional(t.String({ maxLength: 100 })) }) }
  )
  .post(
    "/",
    async ({ body, status }) => {
      const trainerId = await getDefaultTrainerId();
      const mp = parseMovementPattern(body.movementPattern);
      if (!mp.ok) {
        return status(422, { error: "invalid movementPattern", issues: mp.issues });
      }
      const fm = parseFunctionalMovement(body.functionalMovement);
      if (!fm.ok) {
        return status(422, { error: "invalid functionalMovement", issues: fm.issues });
      }

      const [created] = await db
        .insert(exercises)
        .values({
          ...body,
          trainerId,
          movementPattern: mp.value ?? null,
          functionalMovement: fm.value ?? null,
        })
        .returning();
      return status(201, created);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        primaryMuscleGroup: t.String(),
        secondaryMuscleGroups: t.Optional(t.Array(t.String(), { maxItems: 4 })),
        equipment: t.String(),
        movementPattern: t.Optional(t.Union([t.String(), t.Null()])),
        functionalMovement: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      if (body.movementPattern !== undefined) {
        const mp = parseMovementPattern(body.movementPattern);
        if (!mp.ok) {
          return status(422, { error: "invalid movementPattern", issues: mp.issues });
        }
      }
      if (body.functionalMovement !== undefined) {
        const fm = parseFunctionalMovement(body.functionalMovement);
        if (!fm.ok) {
          return status(422, { error: "invalid functionalMovement", issues: fm.issues });
        }
      }

      const [existing] = await db.select().from(exercises).where(eq(exercises.id, params.id));
      if (!existing) return status(404, { error: "exercise not found" });

      const updates: {
        movementPattern?: MovementPattern | null;
        functionalMovement?: FunctionalMovement | null;
      } = {};

      if (body.movementPattern !== undefined) {
        updates.movementPattern = body.movementPattern as MovementPattern | null;
      }
      if (body.functionalMovement !== undefined) {
        updates.functionalMovement = body.functionalMovement as FunctionalMovement | null;
      }

      if (Object.keys(updates).length === 0) {
        return existing;
      }

      const [updated] = await db
        .update(exercises)
        .set(updates)
        .where(eq(exercises.id, params.id))
        .returning();
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        movementPattern: t.Optional(t.Union([t.String(), t.Null()])),
        functionalMovement: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  );
