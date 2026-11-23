import { describe, expect, test } from "bun:test";
import { validateProgramDoc } from "./programDoc";
import type { ProgramWeekDto } from "./api/types";

describe("validateProgramDoc", () => {
  const validWeeks: ProgramWeekDto[] = [
    {
      week: 1,
      sessions: [
            {
              id: crypto.randomUUID(),
              name: "Session 1",
              seq: 1,
              weekday: 1,
              order: 0,
              kind: "exercises",
              cardio: null,
              exercises: [
                {
                  id: crypto.randomUUID(),
                  exerciseId: "ex-squat",
                  exerciseName: "Squat",
                  order: 0,
                  prescribedSets: [
                    { setNumber: 1, type: "working", reps: 5, amrap: false },
                  ],
                },
              ],
            },
            {
              id: crypto.randomUUID(),
              name: "Session 2",
              seq: 2,
              weekday: 1,
              order: 1,
              kind: "exercises",
              cardio: null,
              exercises: [
                {
                  id: crypto.randomUUID(),
                  exerciseId: "ex-bench",
                  exerciseName: "Bench",
                  order: 0,
                  prescribedSets: [
                    { setNumber: 1, type: "working", reps: 5, amrap: false },
                  ],
                },
              ],
            },
      ],
    },
  ];

  test("validateProgramDoc flags invalid editing states", () => {
    // Valid two-session day -> ok: true
    const validRes = validateProgramDoc(validWeeks);
    expect(validRes.ok).toBe(true);

    // Exercise notes > 1000 chars -> ok: false + message
    const longExNotes: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    longExNotes[0].sessions[0].exercises[0].notes = "a".repeat(1001);
    const exNotesRes = validateProgramDoc(longExNotes);
    expect(exNotesRes.ok).toBe(false);
    if (!exNotesRes.ok) {
      expect(exNotesRes.message).toContain("1000");
    }

    // Session notes > 2000 chars -> ok: false + message
    const longSessNotes: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    longSessNotes[0].sessions[0].notes = "b".repeat(2001);
    const sessNotesRes = validateProgramDoc(longSessNotes);
    expect(sessNotesRes.ok).toBe(false);
    if (!sessNotesRes.ok) {
      expect(sessNotesRes.message).toContain("2000");
    }

    // Empty exercise session -> ok: false + contains "exercise session requires at least one exercise"
    const emptyExercises: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    emptyExercises[0].sessions[0].exercises = [];
    const emptyRes = validateProgramDoc(emptyExercises);
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.message).toContain("exercise session requires at least one exercise");
    }
  });

  test("names a bad set field in plain words", () => {
    const negRest: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    negRest[0].sessions[0].exercises[0].prescribedSets[0].restSeconds = -30;
    expect(validateProgramDoc(negRest)).toEqual({ ok: false, message: "Week 1 · Session 1 (Session 1): Squat — rest can't be negative" });

    const highRpe: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    const sets = highRpe[0].sessions[1].exercises[0].prescribedSets;
    sets.push({ ...sets[0], setNumber: 2, targetRpe: 12 });
    expect(validateProgramDoc(highRpe)).toEqual({ ok: false, message: "Week 1 · Session 2 (Session 2): Bench — set 2: RPE must be 1–10" });
  });
});
