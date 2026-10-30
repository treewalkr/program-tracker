import { describe, expect, test } from "bun:test";
import { classifyExercise } from "./map-patterns";

describe("classifyExercise", () => {
  test("7 pinned cases incl. ordering", () => {
    expect(classifyExercise("bench press")).toEqual({
      movementPattern: "horizontal_push",
      functionalMovement: "push",
    });

    expect(classifyExercise("upright row")).toEqual({
      movementPattern: "vertical_pull",
      functionalMovement: "pull",
    });

    expect(classifyExercise("Bulgarian Split Squat")).toEqual({
      movementPattern: "knee_dominant",
      functionalMovement: "single_leg",
    });

    expect(classifyExercise("Romanian Deadlift")).toEqual({
      movementPattern: "hip_dominant",
      functionalMovement: "bend_lift",
    });

    expect(classifyExercise("Plank")).toEqual({
      movementPattern: "anti_trunk_flexion",
      functionalMovement: null,
    });

    expect(classifyExercise("Suitcase Carry")).toEqual({
      movementPattern: "anti_lateral_flexion",
      functionalMovement: "locomotion",
    });

    expect(classifyExercise("Zzz Unknown")).toEqual({
      movementPattern: null,
      functionalMovement: null,
    });
  });
});
