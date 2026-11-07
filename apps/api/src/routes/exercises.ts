import { Elysia, t } from "elysia";
import { and, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db, exercises, setLogs, type ExerciseRow } from "@pt/db";
import { Equipment, FunctionalMovement, MovementPattern, MuscleGroup } from "@pt/shared";
import { getDefaultTrainerId } from "../lib/trainer";

// Plain strings checked with zod in the handler: t.UnionEnum fills an absent
// optional field with its first member (turning a partial PATCH into an edit),
// and literal unions built from arrays lose their types through Eden.
const Muscle = t.String({ maxLength: 40 });
const Equip = t.String({ maxLength: 40 });
const Pattern = t.Union([t.String({ maxLength: 40 }), t.Null()]);
const Functional = t.Union([t.String({ maxLength: 40 }), t.Null()]);
const Name = t.String({ minLength: 1, maxLength: 160 });
const Secondary = t.Array(Muscle, { maxItems: 4 });
const Note = t.Union([t.String({ maxLength: 280 }), t.Null()]);

interface Fields {
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  equipment?: string;
  movementPattern?: string | null;
  functionalMovement?: string | null;
}

/** First vocabulary violation in the body, or null. */
function invalidField(b: Fields): string | null {
  if (b.primaryMuscleGroup !== undefined && !MuscleGroup.safeParse(b.primaryMuscleGroup).success) return "primaryMuscleGroup";
  if (b.secondaryMuscleGroups?.some((m) => !MuscleGroup.safeParse(m).success)) return "secondaryMuscleGroups";
  if (b.equipment !== undefined && !Equipment.safeParse(b.equipment).success) return "equipment";
  if (b.movementPattern != null && !MovementPattern.safeParse(b.movementPattern).success) return "movementPattern";
  if (b.functionalMovement != null && !FunctionalMovement.safeParse(b.functionalMovement).success) return "functionalMovement";
  return null;
}

/** Seed library + this trainer's own exercises. */
const visibleTo = (trainerId: string) => or(isNull(exercises.trainerId), eq(exercises.trainerId, trainerId))!;

/** exerciseId → number of this trainer's programs (any status) that prescribe it. */
async function usageCounts(trainerId: string, exerciseId?: string): Promise<Map<string, number>> {
  const rows = await db.execute<{ id: string; n: number }>(sql`
    select e->>'exerciseId' as id, count(distinct p.id)::int as n
    from programs p
    cross join lateral jsonb_array_elements(p.sessions) w
    cross join lateral jsonb_array_elements(coalesce(w->'sessions', '[]'::jsonb)) s
    cross join lateral jsonb_array_elements(coalesce(s->'exercises', '[]'::jsonb)) e
    where p.trainer_id = ${trainerId}
    ${exerciseId ? sql`and e->>'exerciseId' = ${exerciseId}` : sql``}
    group by 1`);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

const toDto = (row: ExerciseRow, usedIn: number) => ({
  id: row.id,
  name: row.name,
  primaryMuscleGroup: row.primaryMuscleGroup,
  secondaryMuscleGroups: row.secondaryMuscleGroups,
  equipment: row.equipment,
  movementPattern: row.movementPattern,
  functionalMovement: row.functionalMovement,
  note: row.note,
  /** false = WGER seed entry (name, muscles and equipment are locked). */
  custom: row.trainerId !== null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  usedIn,
});

/** Another visible exercise already has this name (case-insensitive)? */
async function nameTaken(trainerId: string, name: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        visibleTo(trainerId),
        sql`lower(trim(${exercises.name})) = lower(trim(${name}))`,
        exceptId ? ne(exercises.id, exceptId) : undefined
      )
    )
    .limit(1);
  return Boolean(hit);
}

export const exerciseRoutes = new Elysia({ prefix: "/v1/exercises", tags: ["exercises"] })
  /** Search the seed library + this trainer's custom exercises (archived included, flagged). */
  .get(
    "/",
    async ({ query }) => {
      const trainerId = await getDefaultTrainerId();
      const where = query.q ? and(visibleTo(trainerId), ilike(exercises.name, `%${query.q}%`)) : visibleTo(trainerId);
      const [rows, uses] = await Promise.all([
        db.select().from(exercises).where(where).orderBy(exercises.name).limit(5000),
        usageCounts(trainerId),
      ]);
      return rows.map((r) => toDto(r, uses.get(r.id) ?? 0));
    },
    { query: t.Object({ q: t.Optional(t.String({ maxLength: 100 })) }) }
  )
  .post(
    "/",
    async ({ body, status }) => {
      const bad = invalidField(body);
      if (bad) return status(422, { error: `invalid ${bad}` });
      const trainerId = await getDefaultTrainerId();
      const name = body.name.trim();
      if (await nameTaken(trainerId, name)) return status(409, { error: `"${name}" is already in the library` });
      const [created] = await db
        .insert(exercises)
        .values({
          trainerId,
          name,
          primaryMuscleGroup: body.primaryMuscleGroup,
          secondaryMuscleGroups: (body.secondaryMuscleGroups ?? []).filter((m) => m !== body.primaryMuscleGroup),
          equipment: body.equipment,
          movementPattern: (body.movementPattern ?? null) as MovementPattern | null,
          functionalMovement: (body.functionalMovement ?? null) as FunctionalMovement | null,
          note: body.note?.trim() || null,
        })
        .returning();
      return status(201, toDto(created, 0));
    },
    {
      body: t.Object({
        name: Name,
        primaryMuscleGroup: Muscle,
        secondaryMuscleGroups: t.Optional(Secondary),
        equipment: Equip,
        movementPattern: t.Optional(Pattern),
        functionalMovement: t.Optional(Functional),
        note: t.Optional(Note),
      }),
    }
  )
  /**
   * Edit an exercise. Seed entries only take pattern, functional, note and
   * archived (hide); name, muscles and equipment are locked → 403.
   */
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const bad = invalidField(body);
      if (bad) return status(422, { error: `invalid ${bad}` });
      const trainerId = await getDefaultTrainerId();
      const [existing] = await db
        .select()
        .from(exercises)
        .where(and(eq(exercises.id, params.id), visibleTo(trainerId)));
      if (!existing) return status(404, { error: "exercise not found" });

      const custom = existing.trainerId !== null;
      const locked = (["name", "primaryMuscleGroup", "secondaryMuscleGroups", "equipment"] as const).filter(
        (k) => body[k] !== undefined
      );
      if (!custom && locked.length) {
        return status(403, { error: `library exercises can't change ${locked.join(", ")} — duplicate it instead` });
      }

      const updates: Partial<typeof exercises.$inferInsert> = {};
      if (body.name !== undefined) {
        const name = body.name.trim();
        if (await nameTaken(trainerId, name, existing.id)) {
          return status(409, { error: `"${name}" is already in the library` });
        }
        updates.name = name;
      }
      if (body.primaryMuscleGroup !== undefined) updates.primaryMuscleGroup = body.primaryMuscleGroup;
      if (body.equipment !== undefined) updates.equipment = body.equipment;
      if (body.secondaryMuscleGroups !== undefined || body.primaryMuscleGroup !== undefined) {
        const primary = updates.primaryMuscleGroup ?? existing.primaryMuscleGroup;
        updates.secondaryMuscleGroups = (body.secondaryMuscleGroups ?? existing.secondaryMuscleGroups).filter(
          (m) => m !== primary
        );
      }
      if (body.movementPattern !== undefined) updates.movementPattern = body.movementPattern as MovementPattern | null;
      if (body.functionalMovement !== undefined) updates.functionalMovement = body.functionalMovement as FunctionalMovement | null;
      if (body.note !== undefined) updates.note = body.note?.trim() || null;
      if (body.archived !== undefined) updates.archivedAt = body.archived ? (existing.archivedAt ?? new Date()) : null;

      const [row] = Object.keys(updates).length
        ? await db.update(exercises).set(updates).where(eq(exercises.id, existing.id)).returning()
        : [existing];
      const uses = await usageCounts(trainerId, row.id);
      return toDto(row, uses.get(row.id) ?? 0);
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(Name),
        primaryMuscleGroup: t.Optional(Muscle),
        secondaryMuscleGroups: t.Optional(Secondary),
        equipment: t.Optional(Equip),
        movementPattern: t.Optional(Pattern),
        functionalMovement: t.Optional(Functional),
        note: t.Optional(Note),
        archived: t.Optional(t.Boolean()),
      }),
    }
  )
  /**
   * Delete for good — only the trainer's own exercises that no program
   * prescribes and no log references. Everything else archives instead (409).
   */
  .delete(
    "/:id",
    async ({ params, status }) => {
      const trainerId = await getDefaultTrainerId();
      const [existing] = await db
        .select()
        .from(exercises)
        .where(and(eq(exercises.id, params.id), visibleTo(trainerId)));
      if (!existing) return status(404, { error: "exercise not found" });
      if (existing.trainerId === null) return status(403, { error: "library exercises can be hidden, not deleted" });

      const uses = (await usageCounts(trainerId, existing.id)).get(existing.id) ?? 0;
      if (uses) return status(409, { error: `used in ${uses} program${uses === 1 ? "" : "s"} — archive it instead` });
      const [logged] = await db.select({ id: setLogs.id }).from(setLogs).where(eq(setLogs.exerciseId, existing.id)).limit(1);
      if (logged) return status(409, { error: "it has logged sets — archive it instead" });

      await db.delete(exercises).where(eq(exercises.id, existing.id));
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
