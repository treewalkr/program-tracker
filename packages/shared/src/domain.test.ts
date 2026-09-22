import { describe, expect, test } from "bun:test";
import {
  AiProgramDraft,
  DraftExerciseRef,
  estimate1rm,
  LoggedSet,
  PrescribedSet,
  Program,
} from "./index";

const uuid = () => crypto.randomUUID();

describe("PrescribedSet", () => {
  test("accepts a plain working set and applies defaults", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 8 });
    expect(s.type).toBe("working");
    expect(s.amrap).toBe(false);
  });

  test("rejects impossible reps", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 0 })).toThrow();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 101 })).toThrow();
  });

  test("rejects RPE out of 1-10", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 11 })).toThrow();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 0 })).toThrow();
    expect(() =>
      PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 10 })
    ).not.toThrow();
  });
});

describe("Program", () => {
  const baseExercise = { id: uuid(), exerciseId: uuid(), order: 0, prescribedSets: [{ setNumber: 1, reps: 5 }] };

  test("requires at least one session with one exercise", () => {
    expect(() =>
      Program.parse({
        id: uuid(),
        trainerId: uuid(),
        clientId: null,
        name: "Block 1",
        sessions: [],
        createdAt: new Date().toISOString(),
      })
    ).toThrow();
  });

  test("accepts a minimal valid program and applies defaults", () => {
    const p = Program.parse({
      id: uuid(),
      trainerId: uuid(),
      clientId: null,
      name: "Block 1",
      sessions: [{ id: uuid(), name: "Day A", order: 0, exercises: [baseExercise] }],
      createdAt: new Date().toISOString(),
    });
    expect(p.status).toBe("draft");
    expect(p.version).toBe(1);
    expect(p.aiAssisted).toBe(false);
    expect(p.createdFromProgramId).toBeNull();
  });
});

describe("LoggedSet", () => {
  test("bodyweight set needs no weight", () => {
    const s = LoggedSet.parse({
      id: uuid(),
      programExerciseId: null,
      exerciseId: uuid(),
      setNumber: 1,
      reps: 12,
    });
    expect(s.weightKg).toBeUndefined();
    expect(s.type).toBe("working");
  });

  test("reps are required — no phantom sets", () => {
    expect(() =>
      LoggedSet.parse({ id: uuid(), programExerciseId: null, exerciseId: uuid(), setNumber: 1 })
    ).toThrow();
  });
});

describe("estimate1rm", () => {
  test("Epley formula with rounding", () => {
    expect(estimate1rm(100, 1)).toBe(103.3); // 100 * (1 + 1/30)
    expect(estimate1rm(100, 5)).toBe(116.7); // 100 * (1 + 5/30)
  });

  test("caps rep multiplier growth at 12 reps", () => {
    expect(estimate1rm(100, 12)).toBe(estimate1rm(100, 30));
  });

  test("zero-safe", () => {
    expect(estimate1rm(0, 5)).toBe(0);
    expect(estimate1rm(100, 0)).toBe(0);
  });
});

describe("DraftExerciseRef (AI output gate)", () => {
  test("requires exerciseId OR exerciseName", () => {
    const sets = [{ setNumber: 1, reps: 8 }];
    expect(() => DraftExerciseRef.parse({ prescribedSets: sets })).toThrow();
    expect(() =>
      DraftExerciseRef.parse({ prescribedSets: sets, exerciseId: uuid() })
    ).not.toThrow();
    expect(() =>
      DraftExerciseRef.parse({ prescribedSets: sets, exerciseName: "Bulgarian split squat" })
    ).not.toThrow();
  });

  test("a set with no reps never passes the gate", () => {
    expect(() =>
      DraftExerciseRef.parse({
        exerciseName: "Squat",
        prescribedSets: [{ setNumber: 1, type: "working" }],
      })
    ).toThrow();
  });
});

describe("AiProgramDraft (full LLM payload)", () => {
  test("accepts a well-formed draft", () => {
    const d = AiProgramDraft.parse({
      name: "Block 2",
      rationale: "Volume held, intensity +2.5kg on main lifts.",
      clientSummary: "Same split, small jumps on the big lifts.",
      sessions: [
        {
          name: "Day A — Lower",
          exercises: [
            {
              exerciseName: "Back Squat",
              prescribedSets: [
                { setNumber: 1, type: "warm_up", reps: 5 },
                { setNumber: 2, reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
              ],
            },
          ],
        },
      ],
    });
    expect(d.sessions).toHaveLength(1);
  });

  test("rejects a draft with empty sessions (AI always proposes structure)", () => {
    expect(() =>
      AiProgramDraft.parse({
        name: "Empty",
        rationale: "nothing",
        clientSummary: "nothing",
        sessions: [],
      })
    ).toThrow();
  });
});
