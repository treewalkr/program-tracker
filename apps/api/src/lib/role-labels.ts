import { asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, exercises, roleLabels, type RoleLabelRow } from "@pt/db";
import { mergeRoleLabels, type Equipment, type MuscleGroup, type RoleLabel } from "@pt/shared";

/** The trainer's rows plus the global ones (none yet) — globals first, so a personal row wins. */
export async function roleLabelRows(trainerId: string): Promise<RoleLabelRow[]> {
  const rows = await db
    .select()
    .from(roleLabels)
    .where(or(eq(roleLabels.trainerId, trainerId), isNull(roleLabels.trainerId)))
    .orderBy(asc(roleLabels.createdAt));
  return [...rows.filter((r) => r.trainerId === null), ...rows.filter((r) => r.trainerId !== null)];
}

/** Built-ins (with the trainer's overrides) + the trainer's own labels, by rank; archived flagged. */
export async function loadRoleLabels(trainerId: string): Promise<RoleLabel[]> {
  return mergeRoleLabels(await roleLabelRows(trainerId));
}

/** exerciseId → the catalog fields suggestRole reads, for the ids a draft names. */
export async function roleHintsFor(ids: string[]) {
  const uuids = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const rows = uuids.length
    ? await db
        .select({
          id: exercises.id,
          movementPattern: exercises.movementPattern,
          primaryMuscleGroup: exercises.primaryMuscleGroup,
          equipment: exercises.equipment,
        })
        .from(exercises)
        .where(inArray(exercises.id, uuids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (id: string | undefined) => {
    const r = id ? byId.get(id) : undefined;
    return r ? { movementPattern: r.movementPattern, primaryMuscleGroup: r.primaryMuscleGroup as MuscleGroup, equipment: r.equipment as Equipment } : undefined;
  };
}
