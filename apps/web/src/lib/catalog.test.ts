import { describe, expect, test } from "bun:test";
import { groupExercises } from "./catalog";
import type { ExerciseDto } from "./api/types";
import { MOVEMENT_PATTERNS } from "@pt/shared";

describe("groupExercises", () => {
  const dummyExercises: ExerciseDto[] = [
    {
      id: "1",
      name: "Bench Press",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: [],
      equipment: "barbell",
      movementPattern: "horizontal_push",
      functionalMovement: "push",
    },
    {
      id: "2",
      name: "Barbell Row",
      primaryMuscleGroup: "back",
      secondaryMuscleGroups: [],
      equipment: "barbell",
      movementPattern: "horizontal_pull",
      functionalMovement: "pull",
    },
    {
      id: "3",
      name: "Back Squat",
      primaryMuscleGroup: "quads",
      secondaryMuscleGroups: [],
      equipment: "barbell",
      movementPattern: "knee_dominant",
      functionalMovement: "squat",
    },
    {
      id: "4",
      name: "Mystery Drill",
      primaryMuscleGroup: "core",
      secondaryMuscleGroups: [],
      equipment: "bodyweight",
      movementPattern: null,
      functionalMovement: null,
    },
  ];

  test("muscle axis groups alphabetically", () => {
    const groups = groupExercises(dummyExercises, "muscle");
    expect(groups.map((g) => g.key)).toEqual(["back", "chest", "core", "quads"]);
    expect(groups.every((g) => g.key !== "unclassified")).toBe(true);
  });

  test("pattern axis follows enum order with unclassified last", () => {
    const groups = groupExercises(dummyExercises, "pattern");
    const keys = groups.map((g) => g.key);
    expect(keys[keys.length - 1]).toBe("unclassified");
    expect(groups[groups.length - 1].label).toBe("Unclassified");
    expect(groups[groups.length - 1].exercises[0].name).toBe("Mystery Drill");

    // All pattern keys before unclassified must follow MOVEMENT_PATTERNS order
    const patternKeys = keys.slice(0, -1);
    const indices = patternKeys.map((k) => MOVEMENT_PATTERNS.indexOf(k as any));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});
