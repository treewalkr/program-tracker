import { describe, expect, test } from "bun:test";
import { logToInput, type LogDtoLike } from "./logRestore";

const lifting: LogDtoLike & { id: string; createdAt: string } = {
  id: "log-1",
  createdAt: "2026-11-07T10:00:00Z",
  clientId: "c1",
  programId: "p1",
  programSessionId: "ps1",
  date: "2026-11-07",
  kind: "lifting",
  cardio: null,
  notes: "felt heavy",
  perceivedEnergy: 6,
  readiness: { sleep: 2, soreness: 4 },
  flags: [{ programExerciseId: "pe1", exerciseId: "ex1", kind: "pain", note: "low back" }],
  sets: [
    { programExerciseId: "pe1", exerciseId: "ex1", setNumber: 1, type: "backoff", weightKg: 60, reps: 5, rpe: null },
    { programExerciseId: "pe2", exerciseId: "ex2", setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8.5 },
    { programExerciseId: null, exerciseId: "ex3", setNumber: 2, type: "working", weightKg: null, reps: 12, rpe: 7 },
  ],
};

describe("logToInput", () => {
  test("a lifting log comes back field for field, as an add", () => {
    expect(logToInput(lifting)).toEqual({
      clientId: "c1",
      programId: "p1",
      programSessionId: "ps1",
      date: "2026-11-07",
      kind: "lifting",
      cardio: null,
      notes: "felt heavy",
      perceivedEnergy: 6,
      readiness: { sleep: 2, soreness: 4 },
      flags: [{ programExerciseId: "pe1", exerciseId: "ex1", kind: "pain", note: "low back" }],
      onDuplicate: "add",
      sets: [
        { programExerciseId: "pe1", exerciseId: "ex1", setNumber: 1, type: "backoff", weightKg: 60, reps: 5 },
        { programExerciseId: "pe2", exerciseId: "ex2", setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8.5 },
        { programExerciseId: null, exerciseId: "ex3", setNumber: 2, type: "working", reps: 12, rpe: 7 },
      ],
    });
  });

  test("nulls on optional scalars drop out; ids and timestamps never travel", () => {
    const out = logToInput({ ...lifting, notes: null, perceivedEnergy: null, readiness: null, flags: null });
    expect("notes" in out).toBe(false);
    expect("perceivedEnergy" in out).toBe(false);
    expect(out.readiness).toBeNull();
    expect(out.flags).toBeNull();
    expect("id" in out).toBe(false);
    expect("createdAt" in out).toBe(false);
  });

  test("a cardio log keeps its payload and no sets", () => {
    const cardio = { modality: "Bike", durationMin: 30, hrZone: null, distanceKm: 12.5, rpe: 6 };
    const out = logToInput({ ...lifting, programSessionId: null, kind: "cardio", cardio, sets: [] });
    expect(out.kind).toBe("cardio");
    expect(out.cardio).toEqual(cardio);
    expect(out.cardio).not.toBe(cardio);
    expect(out.sets).toEqual([]);
    expect(out.programSessionId).toBeNull();
  });
});
