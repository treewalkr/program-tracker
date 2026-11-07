import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mockApi } from "./api";
import type { ProgramWeekDto, ProgramPhasingDto } from "../types";

describe("mockApi.saveProgram", () => {
  // The mock store is shared across test files; put Maya's seed block back so
  // later files (e.g. generations.test.ts) see the original weeks and phasing.
  let seed: Awaited<ReturnType<typeof mockApi.program>>;
  beforeAll(async () => {
    seed = structuredClone(await mockApi.program("pg-maya-a"));
  });
  afterAll(async () => {
    await mockApi.saveProgram("pg-maya-a", seed.weeks, seed.phasing ?? null);
  });

  test("saveProgram bumps version and replaces weeks", async () => {
    const original = await mockApi.program("pg-maya-a");
    const oldVersion = original.version;

    // Create a valid two-session day
    const newWeeks: ProgramWeekDto[] = [
      {
        week: 1,
        sessions: [
          {
            id: crypto.randomUUID(),
            name: "Morning Lift",
            seq: 1,
            weekday: 1,
            order: 0,
            kind: "lifting",
            cardio: null,
            exercises: [
              {
                id: crypto.randomUUID(),
                exerciseId: "ex-squat",
                exerciseName: "Back Squat",
                order: 0,
                prescribedSets: [
                  { setNumber: 1, type: "working", reps: 5, targetRpe: 8, restSeconds: 120, amrap: false },
                ],
              },
            ],
          },
          {
            id: crypto.randomUUID(),
            name: "Afternoon Lift",
            seq: 2,
            weekday: 1,
            order: 1,
            kind: "lifting",
            cardio: null,
            exercises: [
              {
                id: crypto.randomUUID(),
                exerciseId: "ex-rdl",
                exerciseName: "Romanian Deadlift",
                order: 0,
                prescribedSets: [
                  { setNumber: 1, type: "working", reps: 8, targetRpe: 7, restSeconds: 90, amrap: false },
                ],
              },
            ],
          },
        ],
      },
    ];

    const saved = await mockApi.saveProgram("pg-maya-a", newWeeks);
    expect(saved.version).toBe(oldVersion + 1);
    expect(saved.weeks).toEqual(newWeeks);
    expect(saved.weeks[0].sessions.length).toBe(2);
  });

  test("saveProgram updates phasing; null clears it; absent leaves it", async () => {
    const current = await mockApi.program("pg-maya-a");
    const v0 = current.version;

    const newPhasing: ProgramPhasingDto = {
      plannedWeeks: 4,
      phase: "hypertrophy",
      nextPhase: "strength",
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "deload" },
      ],
    };

    // Update phasing
    const withPhasing = await mockApi.saveProgram("pg-maya-a", current.weeks, newPhasing);
    expect(withPhasing.version).toBe(v0 + 1);
    expect(withPhasing.phasing).toEqual(newPhasing);

    // Absent phasing leaves it untouched
    const absentPhasing = await mockApi.saveProgram("pg-maya-a", current.weeks);
    expect(absentPhasing.version).toBe(v0 + 2);
    expect(absentPhasing.phasing).toEqual(newPhasing);

    // Explicit null clears it
    const clearedPhasing = await mockApi.saveProgram("pg-maya-a", current.weeks, null);
    expect(clearedPhasing.version).toBe(v0 + 3);
    expect(clearedPhasing.phasing).toBeNull();
  });

  test("saveProgram rejects an invalid weeks document", async () => {
    // Empty lifting session (no exercises)
    const invalidWeeks: ProgramWeekDto[] = [
      {
        week: 1,
        sessions: [
          {
            id: crypto.randomUUID(),
            name: "Empty Session",
            seq: 1,
            order: 0,
            kind: "lifting",
            cardio: null,
            exercises: [],
          },
        ],
      },
    ];

    expect(mockApi.saveProgram("pg-maya-a", invalidWeeks)).rejects.toThrow("invalid weeks document");
  });
});
