import { normalizeGroups } from "@pt/shared";
import type { CardioPrescriptionDto, ProgramExerciseDto, WeekDirective, WeekMetric } from "./api/types";

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

export interface CustomWeekRow {
  directive: WeekDirective;
  metric: WeekMetric | "";
  deltaPercent: number | null;
}

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
  sessions: SessionRow[];
}

/** A session's exercises as saved: always the editor's order — what the trainer built is
 *  what they get. Groups are tidied (re-lettered, singletons dropped, rounds evened). */
export function exercisesForSave<
  T extends { group?: string | null; prescribedSets?: readonly { setNumber: number }[] },
>(list: readonly T[]): T[] {
  return normalizeGroups([...list]);
}
