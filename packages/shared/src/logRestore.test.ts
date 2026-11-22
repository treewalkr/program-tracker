import { describe, expect, test } from "bun:test";
import { logToInput, type LogDtoLike } from "./logRestore";

const exerciseLog: LogDtoLike & { id: string; createdAt: string } = {
  id: "log-1",
  createdAt: "2026-11-07T10:00:00Z",
  clientId: "c1",
  programId: "p1",
  programSessionId: "ps1",
  date: "2026-11-07",
  kind: "exercises",
  cardio: null,
  notes: "felt heavy",
  perceivedEnergy: 6,
  readiness: { sleep: 2, soreness: 4 },
  flags: [{ programExerciseId: "pe1", exerciseId: "ex1", kind: "pain", note: "low back" }],
  prepDone: ["pp1"],
  sets: [
    { programExerciseId: "pe1", exerciseId: "ex1", setNumber: 1, type: "backoff", weightKg: 60, reps: 5, rpe: null },
    { programExerciseId: "pe2", exerciseId: "ex2", setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8.5 },
    { programExerciseId: null, exerciseId: "ex3", setNumber: 2, type: "working", weightKg: null, reps: 12, rpe: 7 },
  ],
};

describe("logToInput", () => {
  test("a exercise log comes back field for field, as an add", () => {
    expect(logToInput(exerciseLog)).toEqual({
      clientId: "c1",
      programId: "p1",
      programSessionId: "ps1",
      date: "2026-11-07",
      kind: "exercises",
      cardio: null,
      notes: "felt heavy",
      perceivedEnergy: 6,
      readiness: { sleep: 2, soreness: 4 },
      flags: [{ programExerciseId: "pe1", exerciseId: "ex1", kind: "pain", note: "low back" }],
      prepDone: ["pp1"],
      onDuplicate: "add",
      sets: [
        { programExerciseId: "pe1", exerciseId: "ex1", setNumber: 1, type: "backoff", weightKg: 60, reps: 5 },
        { programExerciseId: "pe2", exerciseId: "ex2", setNumber: 1, type: "working", weightKg: 100, reps: 5, rpe: 8.5 },
        { programExerciseId: null, exerciseId: "ex3", setNumber: 2, type: "working", reps: 12, rpe: 7 },
      ],
    });
  });

  test("nulls on optional scalars drop out; ids and timestamps never travel", () => {
    const out = logToInput({ ...exerciseLog, notes: null, perceivedEnergy: null, readiness: null, flags: null });
    expect("notes" in out).toBe(false);
    expect("perceivedEnergy" in out).toBe(false);
    expect(out.readiness).toBeNull();
    expect(out.flags).toBeNull();
    expect("id" in out).toBe(false);
    expect("createdAt" in out).toBe(false);
  });

  test("a cardio log keeps its payload and no sets", () => {
    const cardio = { modality: "Bike", durationMin: 30, hrZone: null, distanceKm: 12.5, rpe: 6 };
    const out = logToInput({ ...exerciseLog, programSessionId: null, kind: "cardio", cardio, sets: [] });
    expect(out.kind).toBe("cardio");
    expect(out.cardio).toEqual(cardio);
    expect(out.cardio).not.toBe(cardio);
    expect(out.sets).toEqual([]);
    expect(out.programSessionId).toBeNull();
  });
});

describe("logToInput with cardio", () => {
  test("deep-copies the cardio payload so the restore doesn't share interval results", () => {
    const log: LogDtoLike = {
      ...exerciseLog,
      kind: "cardio",
      sets: [],
      cardio: { modality: "Run", durationSec: 1800, rpe: 6, intervals: [{ intervalId: "i1", rep: 1, durationSec: 180 }] } as never,
    };
    const input = logToInput(log);
    const ivs = (c: unknown) => (c as { intervals: unknown[] }).intervals;
    expect(input.cardio as unknown).toEqual(log.cardio);
    expect(ivs(input.cardio)).not.toBe(ivs(log.cardio));
    expect(ivs(input.cardio)).toEqual(ivs(log.cardio));
  });
});
