import { describe, expect, test } from "bun:test";
import { exerciseMeta, groupByPattern, guessExercise, searchExercises } from "./exerciseSearch";

const ex = (id: string, name: string, primaryMuscleGroup: string, equipment: string, movementPattern: string | null) => ({
  id,
  name,
  primaryMuscleGroup,
  secondaryMuscleGroups: [] as string[],
  equipment,
  movementPattern,
});

const list = [
  ex("squat", "Back Squat", "quads", "barbell", "knee_dominant"),
  ex("fsquat", "Front Squat", "quads", "barbell", "knee_dominant"),
  ex("split", "Bulgarian Split Squat", "quads", "dumbbell", "knee_dominant"),
  ex("rdl", "Romanian Deadlift", "hamstrings", "barbell", "hip_dominant"),
  ex("bench", "Bench Press", "chest", "barbell", "horizontal_push"),
  ex("plank", "Plank", "core", "body only", null),
];

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("searchExercises", () => {
  test("empty query lists everything by name", () => {
    expect(ids(searchExercises(list, "  "))).toEqual(["squat", "bench", "split", "fsquat", "plank", "rdl"]);
  });

  test("name hits outrank muscle/equipment hits; ties sort by name", () => {
    expect(ids(searchExercises(list, "b"))).toEqual(["squat", "bench", "split", "fsquat", "plank", "rdl"]);
    expect(ids(searchExercises(list, "squat"))).toEqual(["squat", "split", "fsquat"]);
    expect(ids(searchExercises(list, "front"))).toEqual(["fsquat"]);
  });

  test("every word must match, across name, muscle, equipment and pattern", () => {
    expect(ids(searchExercises(list, "squat dumbbell"))).toEqual(["split"]);
    expect(ids(searchExercises(list, "hamstrings"))).toEqual(["rdl"]);
    expect(ids(searchExercises(list, "hip dominant"))).toEqual(["rdl"]);
  });

  test("word starts beat substrings", () => {
    expect(ids(searchExercises(list, "dead"))).toEqual(["rdl"]);
    expect(ids(searchExercises(list, "bul sq"))).toEqual(["split"]);
  });

  test("no match returns empty", () => {
    expect(searchExercises(list, "zercher")).toEqual([]);
  });
});

describe("groupByPattern", () => {
  test("groups in taxonomy order with unpatterned last", () => {
    const groups = groupByPattern(list);
    expect(groups.map((g) => g.label)).toEqual(["Horizontal push", "Knee-dominant", "Hip-dominant", "No pattern"]);
    expect(ids(groups[1].items)).toEqual(["squat", "split", "fsquat"]);
  });
});

test("exerciseMeta", () => {
  expect(exerciseMeta(list[0])).toBe("Quads · barbell · Knee-dominant");
  expect(exerciseMeta(list[5])).toBe("Core · body only");
});

describe("guessExercise", () => {
  test("copies muscle and pattern from the closest name; equipment from the name", () => {
    expect(guessExercise("Zercher Squat", list)).toEqual({ primaryMuscleGroup: "quads", equipment: "barbell", movementPattern: "knee_dominant" });
    expect(guessExercise("Dumbbell Bench Press", list)).toEqual({ primaryMuscleGroup: "chest", equipment: "dumbbell", movementPattern: "horizontal_push" });
  });

  test("nothing to go on leaves fields empty", () => {
    expect(guessExercise("Sled Push", list)).toEqual({ primaryMuscleGroup: "", equipment: "", movementPattern: null });
  });
});
