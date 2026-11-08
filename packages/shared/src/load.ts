import type { OneRepMaxes } from "./domain";

// ---------------------------------------------------------------------------
// Prescribed load resolution (%1RM → kg) and planned volume. Pure.
// ---------------------------------------------------------------------------

/** Smallest load jump on standard plates (1.25 kg a side). */
export const PLATE_STEP_KG = 2.5;

/** Nearest loadable weight: 113.7 → 112.5. */
export function roundToPlate(kg: number, step = PLATE_STEP_KG): number {
  return Math.round(kg / step) * step;
}

/** The client's 1RM for an exercise, or null when none is recorded. */
export function oneRepMaxKg(maxes: OneRepMaxes | null | undefined, exerciseId: string): number | null {
  return maxes?.[exerciseId]?.kg ?? null;
}

export interface LoadLike {
  targetWeightKg?: number | null;
  percent1rm?: number | null;
}

/**
 * The kg a set asks for. A %1RM target resolves against the client's 1RM
 * (rounded to the plate step) and wins when that 1RM is known; otherwise the
 * kg target is the fallback. Null = no load (auto-regulated or bodyweight).
 */
export function resolveLoadKg(set: LoadLike, oneRepMax: number | null | undefined): number | null {
  if (set.percent1rm != null && oneRepMax != null && oneRepMax > 0) {
    return roundToPlate((oneRepMax * set.percent1rm) / 100);
  }
  return set.targetWeightKg ?? null;
}

export interface VolumeSet extends LoadLike {
  reps: number;
  repsMin?: number | null;
  durationSeconds?: number | null;
}
export interface VolumeSession {
  kind?: string | null;
  exercises: { exerciseId: string; prescribedSets: VolumeSet[] }[];
}

/**
 * Planned tonnage of a week: Σ resolved kg × reps over its sets (rep ranges
 * count their bottom, AMRAP its minimum; timed sets never count). Null when no
 * set has a resolvable load — "no plan", not "0 kg".
 */
export function plannedVolume(sessions: VolumeSession[], maxes: OneRepMaxes | null | undefined): number | null {
  let total = 0;
  let loaded = false;
  for (const s of sessions) {
    if ((s.kind ?? "lifting") !== "lifting") continue;
    for (const e of s.exercises) {
      const max = oneRepMaxKg(maxes, e.exerciseId);
      for (const ps of e.prescribedSets) {
        if (ps.durationSeconds != null) continue;
        const kg = resolveLoadKg(ps, max);
        if (kg == null || kg <= 0) continue;
        loaded = true;
        total += kg * (ps.repsMin ?? ps.reps);
      }
    }
  }
  return loaded ? Math.round(total) : null;
}
