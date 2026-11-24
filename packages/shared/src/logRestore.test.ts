import { describe, expect, test } from "bun:test";
import { carriedReview, logToInput, MEMBER_EDIT_CLEARS_REVIEW, type LogDtoLike } from "./logRestore";

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

  test("the coach's review travels when there is one, and only then", () => {
    expect("review" in logToInput(exerciseLog)).toBe(false);
    expect("review" in logToInput({ ...exerciseLog, reviewedAt: null, trainerFeedback: null })).toBe(false);
    expect(logToInput({ ...exerciseLog, reviewedAt: "2026-11-08T07:30:00.000Z", trainerFeedback: "Nice pace" }).review).toEqual({
      reviewedAt: "2026-11-08T07:30:00.000Z",
      trainerFeedback: "Nice pace",
    });
    // feedback on an unreviewed log (a member edit cleared the mark) still comes back
    expect(logToInput({ ...exerciseLog, reviewedAt: null, trainerFeedback: "Nice pace" }).review).toEqual({
      reviewedAt: null,
      trainerFeedback: "Nice pace",
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

describe("carriedReview (a replace keeps the coach's review, D5)", () => {
  const at = "2026-11-20T08:00:00.000Z";
  const noted = { reviewedAt: at, reviewedBy: "t1", trainerFeedback: "Keep HR under 150" };
  const none = { reviewedAt: null, reviewedBy: null, trainerFeedback: null };

  test("nothing to carry → unreviewed, no note", () => {
    expect(carriedReview([], "client")).toEqual(none);
    expect(carriedReview([none], "trainer")).toEqual(none);
  });

  test(`a member's edit keeps the note; the mark ${MEMBER_EDIT_CLEARS_REVIEW ? "clears" : "stays"}`, () => {
    expect(carriedReview([noted], "client")).toEqual(
      MEMBER_EDIT_CLEARS_REVIEW ? { ...none, trainerFeedback: "Keep HR under 150" } : noted,
    );
  });

  test("the coach's own replace keeps both", () => {
    expect(carriedReview([noted], "trainer")).toEqual(noted);
  });

  test("the newest log with a review wins", () => {
    expect(carriedReview([none, noted, { ...noted, trainerFeedback: "older" }], "trainer")).toEqual(noted);
  });
});
