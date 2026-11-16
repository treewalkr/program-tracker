import { inArray } from "drizzle-orm";
import { db, exercises } from "@pt/db";
import type { ProgramWeek } from "@pt/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fill any missing exercise names from the exercises table — one lookup,
 *  any trainer's catalog (the admin has no trainer-scoped one). */
export async function withExerciseNames(week: ProgramWeek): Promise<ProgramWeek> {
  const missing = [
    ...new Set(
      week.sessions.flatMap((s) => (s.exercises ?? []).filter((e) => !e.exerciseName && UUID.test(e.exerciseId)).map((e) => e.exerciseId)),
    ),
  ];
  if (missing.length === 0) return week;
  const rows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.id, missing));
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  return {
    ...week,
    sessions: week.sessions.map((s) => ({
      ...s,
      exercises: (s.exercises ?? []).map((e) => (e.exerciseName || !nameOf.has(e.exerciseId) ? e : { ...e, exerciseName: nameOf.get(e.exerciseId) })),
    })),
  };
}

