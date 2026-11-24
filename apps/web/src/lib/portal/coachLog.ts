import type { PortalLogEntry, PortalLoggedSet, PortalSession, SkipReason } from "@pt/shared";

/** One exercise of a coach's log, as the member reads it back. */
export interface CoachLogLine {
  key: string;
  /** The program's exercise name; null = sets the coach added outside the plan. */
  name: string | null;
  sets: PortalLoggedSet[];
  /** Prescribed in seconds (a hold, an erg interval): each set's reps are seconds. */
  timed: boolean;
  /** Takes no load: a set with no kg is bodyweight ("BW × 12"); on any other move it's reps only. */
  bodyweight: boolean;
  /** The coach marked it skipped (with the reason when given). */
  skipped: { reason: SkipReason | null } | null;
}

/**
 * A coach's log laid out on the session: each planned exercise in order with what was
 * logged on it (or its skip), then any sets the coach added outside the plan. Movement
 * prep logs no sets, so it isn't listed.
 */
export function coachLogLines(session: Pick<PortalSession, "exercises">, entry: Pick<PortalLogEntry, "sets" | "flags">): CoachLogLine[] {
  const main = session.exercises.filter((e) => e.block !== "prep");
  const slotIds = new Set(main.map((e) => e.id));
  const bySet = (a: PortalLoggedSet, b: PortalLoggedSet) => a.setNumber - b.setNumber;
  const lines: CoachLogLine[] = main.map((e) => {
    const flag = entry.flags?.find((f) => f.kind === "skipped" && (f.programExerciseId === e.id || (f.programExerciseId == null && f.exerciseId === e.exerciseId)));
    return {
      key: e.id,
      name: e.exerciseName,
      sets: entry.sets.filter((s) => s.programExerciseId === e.id).sort(bySet),
      // the log page's rule: every prescribed set in seconds
      timed: e.prescribedSets.length > 0 && e.prescribedSets.every((s) => s.durationSeconds != null),
      bodyweight: e.bodyweight ?? false,
      skipped: flag ? { reason: flag.reason ?? null } : null,
    };
  });
  const extra = entry.sets.filter((s) => s.programExerciseId == null || !slotIds.has(s.programExerciseId)).sort(bySet);
  if (extra.length) lines.push({ key: "extra", name: null, sets: extra, timed: false, bodyweight: false, skipped: null });
  return lines;
}
