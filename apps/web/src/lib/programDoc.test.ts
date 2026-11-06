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
              kind: "lifting",
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
              kind: "lifting",
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

    // Empty lifting session -> ok: false + contains "lifting session requires at least one exercise"
    const emptyLifting: ProgramWeekDto[] = JSON.parse(JSON.stringify(validWeeks));
    emptyLifting[0].sessions[0].exercises = [];
    const emptyRes = validateProgramDoc(emptyLifting);
    expect(emptyRes.ok).toBe(false);
    if (!emptyRes.ok) {
      expect(emptyRes.message).toContain("lifting session requires at least one exercise");
    }
  });
});
