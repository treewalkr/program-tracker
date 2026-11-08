import type { PrescribedSet, ProgramExercise, ProgramWeek } from "./domain";

/**
 * The one deload definition. Deloads mainly cut volume and hold or slightly
 * reduce intensity, with no failure sets (Pritchard 2015; Bell 2023 consensus).
 * The program-page button applies it, the deload-week signal and the block
 * templates describe it, and the default plan's deload target uses its volume.
 */
export const DELOAD_LOAD_FACTOR = 0.9;
export const DELOAD_RPE_CAP = 6;

/** Plain-language rules — reuse wherever a deload is described. */
export const DELOAD_RULES = `half the sets per exercise (rounded up), loads −10 %, RPE 6 cap, no AMRAP sets`;

/** Volume vs the previous week: half the sets at 90 % load ≈ −55 %. */
export const DELOAD_VOLUME_DELTA_PERCENT = Math.round((0.5 * DELOAD_LOAD_FACTOR - 1) * 100);

/** −10 %, on the 2.5 kg grid (0.5 kg below 20 kg); never above the original load. */
export function deloadLoad(kg: number): number {
  const step = kg >= 20 ? 2.5 : 0.5;
  const cut = Math.round((kg * DELOAD_LOAD_FACTOR) / step) * step;
  return Math.max(0, Math.min(cut, kg));
}

function deloadExercise(e: ProgramExercise): ProgramExercise {
  const keep = e.prescribedSets.slice(0, Math.ceil(e.prescribedSets.length / 2));
  // A 0-rep failure set needs a rep target once AMRAP is off: borrow the exercise's.
  const fallbackReps = Math.max(0, ...e.prescribedSets.filter((s) => !s.amrap).map((s) => s.reps)) || 8;
  return {
    ...e,
    prescribedSets: keep.map((s, i): PrescribedSet => {
      const next: PrescribedSet = {
        ...s,
        setNumber: i + 1,
        amrap: false,
        targetRpe: Math.min(s.targetRpe ?? DELOAD_RPE_CAP, DELOAD_RPE_CAP),
      };
      if (s.targetWeightKg != null) next.targetWeightKg = deloadLoad(s.targetWeightKg);
      if (s.amrap && s.reps === 0 && s.durationSeconds === undefined) {
        next.reps = fallbackReps;
        if (next.repsMin !== undefined && next.repsMin > next.reps) delete next.repsMin;
      }
      return next;
    }),
  };
}

/** A deloaded copy of `week`: lifting sessions only; cardio is left as planned. */
export function deloadWeek(week: ProgramWeek): ProgramWeek {
  const copy = structuredClone(week);
  return {
    ...copy,
    sessions: copy.sessions.map((s) =>
      s.kind === "lifting" ? { ...s, exercises: s.exercises.map(deloadExercise) } : s
    ),
  };
}
