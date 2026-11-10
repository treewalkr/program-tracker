import { normalizeGroups, sortExercisesByRole, type RoleRank } from "@pt/shared";
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
  /** Save the exercises in the editor's order (imported notes: supersets stay together); else by role. */
  keepOrder?: boolean;
}

/** A session's exercises as saved: the editor's order when `keepOrder`, else sorted by role
 *  (a superset moves as one). Groups are tidied either way. */
export function exercisesForSave<
  T extends { role?: string | null; group?: string | null; prescribedSets?: readonly { setNumber: number }[] },
>(list: readonly T[], keepOrder: boolean | undefined, labels?: readonly RoleRank[]): T[] {
  return normalizeGroups(keepOrder ? [...list] : sortExercisesByRole(list, labels));
}
