import { normalizeGroups } from "@pt/shared";
import type { CardioPrescriptionDto, ProgramExerciseDto } from "./api/types";
import type { PhasingRow } from "./phasing";

/** The new-program form (/clients/:id/programs/new) — one session row of the template week. */
export interface SessionRow {
  key: string;
  name: string;
  kind: "lifting" | "cardio";
  /** Trainer's session type; picking one sets `kind` to its format. */
  typeId?: string;
  cardio: CardioPrescriptionDto;
  exercises: ProgramExerciseDto[];
}

/** A custom scheme week — the shared week-plan row (WeekPlanRows.svelte). */
export type CustomWeekRow = PhasingRow;

/** Every field of the form — kept on this device until Save, and what Paste notes fills. */
export interface DraftForm {
  name: string;
  description: string;
  plannedWeeks: number;
  phase: string;
  nextPhase: string;
  usePhasing: boolean;
  schemeMode: "saved" | "custom" | "none";
  selectedSchemeId: string;
  customWeeks: CustomWeekRow[];
  schemeName: string;
  /** Week A when `weekB` is set, else the one template week. */
  sessions: SessionRow[];
  /** Alternate A/B weeks (FB-013): the even-week routine. null/missing = same every
   *  week, so older kept drafts and Paste notes results load unchanged. */
  weekB?: SessionRow[] | null;
}

/** A session's exercises as saved: always the editor's order — what the trainer built is
 *  what they get. Groups are tidied (re-lettered, singletons dropped, rounds evened). */
export function exercisesForSave<
  T extends { group?: string | null; prescribedSets?: readonly { setNumber: number }[] },
>(list: readonly T[]): T[] {
  return normalizeGroups([...list]);
}

/** A deep copy of a template week for Week B: fresh row keys and exercise ids, so
 *  editing B never touches A. */
export function cloneSessionRows(rows: readonly SessionRow[], newId: () => string): SessionRow[] {
  return structuredClone(rows as SessionRow[]).map((s) => ({
    ...s,
    key: newId(),
    exercises: s.exercises.map((e) => ({ ...e, id: newId() })),
  }));
}
