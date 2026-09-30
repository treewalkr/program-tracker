import { describe, expect, test } from "bun:test";
import {
  AiProgramDraft,
  Client,
  DraftExerciseRef,
  estimate1rm,
  LoggedSet,
  Phasing,
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
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 101 })).toThrow();
    // reps 0 is legal ONLY as a failure (amrap) or timed set
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 0 })).toThrow();
  });

  test("rejects RPE out of 1-10", () => {
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 11 })).toThrow();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 0 })).toThrow();
    expect(() =>
      PrescribedSet.parse({ setNumber: 1, reps: 5, targetRpe: 10 })
    ).not.toThrow();
  });
});

describe("PrescribedSet coach formats", () => {
  test("rep range: repsMin lower bound, reps upper bound", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 10, repsMin: 6 });
    expect(s.repsMin).toBe(6);
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 6, repsMin: 10 })).toThrow();
  });

  test("timed set: durationSeconds with reps 0", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 0, durationSeconds: 60 });
    expect(s.durationSeconds).toBe(60);
  });

  test("failure set: amrap with reps 0", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 0, amrap: true });
    expect(s.amrap).toBe(true);
  });

  test("load target: targetWeightKg present or null", () => {
    const s = PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: 65 });
    expect(s.targetWeightKg).toBe(65);
    expect(
      PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: null }).targetWeightKg
    ).toBeNull();
    expect(() => PrescribedSet.parse({ setNumber: 1, reps: 5, targetWeightKg: 700 })).toThrow();
  });
});

describe("Phasing", () => {
  test("round-trips a scheme-backed phasing with week directives", () => {
    const p = Phasing.parse({
      plannedWeeks: 6,
      phase: "accumulation",
      nextPhase: "intensification",
      deloadWeeks: [4],
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "deload" },
      ],
    });
    expect(p.weeks).toHaveLength(4);
    expect(p.deloadWeeks).toEqual([4]);
  });

  test("deload weeks and week plans must fall within plannedWeeks", () => {
    expect(() =>
      Phasing.parse({ plannedWeeks: 4, phase: "acc", deloadWeeks: [5] })
    ).toThrow();
    expect(() =>
      Phasing.parse({
        plannedWeeks: 4,
        phase: "acc",
        weeks: [{ week: 5, directive: "base" }],
      })
    ).toThrow();
  });

  test("rejects unknown directives", () => {
    expect(() =>
      Phasing.parse({
        plannedWeeks: 4,
        phase: "acc",
        weeks: [{ week: 1, directive: "growth" as never }],
      })
    ).toThrow();
  });

  test("defaults deloadWeeks to empty", () => {
    const p = Phasing.parse({ plannedWeeks: 3, phase: "acc" });
    expect(p.deloadWeeks).toEqual([]);
  });
});

describe("Client trainingDays", () => {
  const base = {
    id: uuid(),
    trainerId: uuid(),
    name: "Maya",
    email: "maya@example.com",
    createdAt: new Date().toISOString(),
  };

  test("accepts ISO weekday ints 1–7", () => {
    const c = Client.parse({ ...base, trainingDays: [1, 3, 5] });
    expect(c.trainingDays).toEqual([1, 3, 5]);
  });

  test("rejects duplicates and out-of-range days", () => {
    expect(() => Client.parse({ ...base, trainingDays: [1, 1] })).toThrow();
    expect(() => Client.parse({ ...base, trainingDays: [0] })).toThrow();
    expect(() => Client.parse({ ...base, trainingDays: [8] })).toThrow();
  });

  test("old-shape clients (no trainingDays) still parse", () => {
    expect(Client.parse(base).trainingDays).toBeUndefined();
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
    expect(p.activatedAt).toBeUndefined();
    expect(p.phasing).toBeUndefined();
  });

  test("accepts conditioning on sessions and phasing + activatedAt on the program", () => {
    const p = Program.parse({
      id: uuid(),
      trainerId: uuid(),
      clientId: null,
      name: "Block 1",
      activatedAt: new Date().toISOString(),
      phasing: {
        plannedWeeks: 6,
        phase: "accumulation",
        deloadWeeks: [4],
        weeks: [
          { week: 1, directive: "base" },
          { week: 2, directive: "+volume" },
        ],
      },
      sessions: [
        {
          id: uuid(),
          name: "Day A",
          order: 0,
          exercises: [baseExercise],
          conditioning: { label: "Zone 2", detail: "20 min easy bike" },
        },
      ],
      createdAt: new Date().toISOString(),
    });
    expect(p.sessions[0].conditioning?.label).toBe("Zone 2");
    expect(p.phasing?.weeks).toHaveLength(2);
    expect(p.activatedAt).toBeTruthy();
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
