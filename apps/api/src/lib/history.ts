import type { SessionLogRow, SetLogRow } from "@pt/db";
import { estimate1rm } from "@pt/shared";
import type { ExerciseHistoryEntry } from "../ai/prompt";

export interface HistoryInput {
  logs: SessionLogRow[];
  sets: SetLogRow[];
  catalog: { id: string; name: string }[];
  /** Max recent working sets listed per exercise. */
  perExercise?: number;
}

const DEFAULT_PER_EXERCISE = 6;

/**
 * Group logged working sets per exercise: recent set strings (oldest→newest)
 * plus best estimated 1RM. Shared by the AI prompt context and the trainer
 * history endpoint.
 */
export function buildHistory({
  logs,
  sets,
  catalog,
  perExercise = DEFAULT_PER_EXERCISE,
}: HistoryInput): ExerciseHistoryEntry[] {
  const logIds = new Set(logs.map((l) => l.id));
  const nameById = new Map(catalog.map((e) => [e.id, e.name]));

  const byExercise = new Map<string, { name: string; sets: string[]; best: number }>();

  for (const set of sets) {
    if (!logIds.has(set.sessionLogId)) continue;
    if (set.type !== "working") continue;
    const name = nameById.get(set.exerciseId);
    if (!name) continue; // exercise outside trainer's catalog — ignore

    const weight = set.weightKg ? Number(set.weightKg) : 0;
    const rpe = set.rpe ? Number(set.rpe) : null;
    const entry = byExercise.get(set.exerciseId) ?? { name, sets: [], best: 0 };
    entry.sets.push(`${weight ? `${weight}kg × ` : ""}${set.reps}${rpe !== null ? ` @ RPE ${rpe}` : ""}`);
    entry.best = Math.max(entry.best, estimate1rm(weight, set.reps));
    byExercise.set(set.exerciseId, entry);
  }

  return [...byExercise.entries()].map(([id, h]) => ({
    exerciseName: h.name,
    exerciseId: id,
    recentSets: h.sets.slice(-perExercise),
    bestE1rm: h.best,
  }));
}
