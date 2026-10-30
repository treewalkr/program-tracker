import {
  FUNCTIONAL_MOVEMENT_INFO,
  FUNCTIONAL_MOVEMENTS,
  MOVEMENT_PATTERN_INFO,
  MOVEMENT_PATTERNS,
} from "@pt/shared";
import type { ExerciseDto } from "./api/types";

export type CatalogAxis = "muscle" | "pattern" | "functional";

export interface ExerciseGroup {
  key: string;
  label: string;
  exercises: ExerciseDto[];
}

export function groupExercises(
  list: readonly ExerciseDto[],
  axis: CatalogAxis
): ExerciseGroup[] {
  if (axis === "muscle") {
    const byMuscle = new Map<string, ExerciseDto[]>();
    for (const e of list) {
      if (!e.primaryMuscleGroup) continue;
      const arr = byMuscle.get(e.primaryMuscleGroup);
      if (arr) {
        arr.push(e);
      } else {
        byMuscle.set(e.primaryMuscleGroup, [e]);
      }
    }
    const keys = [...byMuscle.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((key) => ({
      key,
      label: key,
      exercises: byMuscle.get(key)!,
    }));
  }

  if (axis === "pattern") {
    const byPattern = new Map<string, ExerciseDto[]>();
    const unclassified: ExerciseDto[] = [];

    for (const e of list) {
      if (e.movementPattern && e.movementPattern in MOVEMENT_PATTERN_INFO) {
        const arr = byPattern.get(e.movementPattern);
        if (arr) {
          arr.push(e);
        } else {
          byPattern.set(e.movementPattern, [e]);
        }
      } else {
        unclassified.push(e);
      }
    }

    const groups: ExerciseGroup[] = [];
    for (const p of MOVEMENT_PATTERNS) {
      const exs = byPattern.get(p);
      if (exs && exs.length > 0) {
        groups.push({
          key: p,
          label: MOVEMENT_PATTERN_INFO[p].name,
          exercises: exs,
        });
      }
    }
    if (unclassified.length > 0) {
      groups.push({
        key: "unclassified",
        label: "Unclassified",
        exercises: unclassified,
      });
    }
    return groups;
  }

  // axis === "functional"
  const byFunctional = new Map<string, ExerciseDto[]>();
  const unclassified: ExerciseDto[] = [];

  for (const e of list) {
    if (e.functionalMovement && e.functionalMovement in FUNCTIONAL_MOVEMENT_INFO) {
      const arr = byFunctional.get(e.functionalMovement);
      if (arr) {
        arr.push(e);
      } else {
        byFunctional.set(e.functionalMovement, [e]);
      }
    } else {
      unclassified.push(e);
    }
  }

  const groups: ExerciseGroup[] = [];
  for (const f of FUNCTIONAL_MOVEMENTS) {
    const exs = byFunctional.get(f);
    if (exs && exs.length > 0) {
      groups.push({
        key: f,
        label: FUNCTIONAL_MOVEMENT_INFO[f].label,
        exercises: exs,
      });
    }
  }
  if (unclassified.length > 0) {
    groups.push({
      key: "unclassified",
      label: "Unclassified",
      exercises: unclassified,
    });
  }
  return groups;
}
