import { describe, expect, test } from "bun:test";
import { DELOAD_RULES, DELOAD_VOLUME_DELTA_PERCENT, deloadLoad, deloadWeek } from "./deload";
import type { PrescribedSet, ProgramWeek } from "./domain";

const set = (n: number, p: Partial<PrescribedSet> = {}): PrescribedSet => ({
  setNumber: n,
  type: "working",
  reps: 5,
  amrap: false,
  ...p,
});

const week = (sets: PrescribedSet[][]): ProgramWeek => ({
  week: 4,
  sessions: [
    {
      id: "s1",
      name: "Lower",
      seq: 1,
      order: 0,
      kind: "lifting",
      exercises: sets.map((prescribedSets, i) => ({
        id: `e${i}`,
        exerciseId: `x${i}`,
        order: i,
        prescribedSets,
      })),
    },
    { id: "c1", name: "Run", seq: 1, order: 0, kind: "cardio", exercises: [], cardio: { modality: "Run", durationMin: 40, hrZone: 2 } },
  ],
});

describe("deloadLoad", () => {
  test("cuts 10% on the 2.5 kg grid for barbell loads", () => {
    expect(deloadLoad(150)).toBe(135);
    expect(deloadLoad(137.5)).toBe(125);
    expect(deloadLoad(100)).toBe(90);
  });

  test("uses a 0.5 kg grid for light loads and never rounds up", () => {
    expect(deloadLoad(12)).toBe(11);
    expect(deloadLoad(5)).toBe(4.5);
    expect(deloadLoad(1)).toBeLessThanOrEqual(1);
    expect(deloadLoad(0)).toBe(0);
  });
});

describe("deloadWeek", () => {
  test("keeps half the sets (rounded up) across working and back-off sets", () => {
    const w = week([
      [set(1, { targetWeightKg: 150 }), set(2, { type: "backoff", targetWeightKg: 137.5 }), set(3, { type: "backoff", targetWeightKg: 137.5 }), set(4, { type: "backoff", targetWeightKg: 137.5 })],
      [set(1), set(2), set(3)],
      [set(1)],
    ]);
    const out = deloadWeek(w).sessions[0].exercises.map((e) => e.prescribedSets);
    expect(out.map((s) => s.length)).toEqual([2, 2, 1]);
    expect(out[0].map((s) => s.setNumber)).toEqual([1, 2]);
    expect(out[0].map((s) => s.type)).toEqual(["working", "backoff"]);
  });

  test("cuts every remaining load 10%, so back-offs stay below the top set", () => {
    const w = week([[set(1, { targetWeightKg: 150 }), set(2, { type: "backoff", targetWeightKg: 137.5 }), set(3, { type: "backoff", targetWeightKg: 137.5 })]]);
    const [top, backoff] = deloadWeek(w).sessions[0].exercises[0].prescribedSets;
    expect(top.targetWeightKg).toBe(135);
    expect(backoff.targetWeightKg).toBe(125);
    expect(backoff.targetWeightKg!).toBeLessThan(top.targetWeightKg!);
  });

  test("leaves auto-regulated sets without a load", () => {
    const w = week([[set(1, { targetWeightKg: null }), set(2)]]);
    const [a] = deloadWeek(w).sessions[0].exercises[0].prescribedSets;
    expect(a.targetWeightKg).toBeNull();
  });

  test("caps RPE at 6 and sets it where missing", () => {
    const w = week([[set(1, { targetRpe: 8.5 }), set(2, { targetRpe: 5 })], [set(1)]]);
    const out = deloadWeek(w).sessions[0].exercises;
    expect(out[0].prescribedSets.map((s) => s.targetRpe)).toEqual([6]);
    expect(out[1].prescribedSets[0].targetRpe).toBe(6);
    const low = deloadWeek(week([[set(1, { targetRpe: 5 })]])).sessions[0].exercises[0].prescribedSets[0];
    expect(low.targetRpe).toBe(5);
  });

  test("turns AMRAP off; a 0-rep failure set takes the exercise's rep target", () => {
    const w = week([
      [set(1, { reps: 5 }), set(2, { reps: 5, amrap: true })],
      [set(1, { reps: 8 }), set(2, { reps: 8 }), set(3, { reps: 0, amrap: true })],
      [set(1, { reps: 0, amrap: true })],
    ]);
    // Keep-first-half drops the trailing AMRAP in the first two; force it to stay to test the conversion.
    const amrapFirst = week([[set(1, { reps: 0, amrap: true }), set(2, { reps: 10 })]]);
    const kept = deloadWeek(amrapFirst).sessions[0].exercises[0].prescribedSets[0];
    expect(kept.amrap).toBe(false);
    expect(kept.reps).toBe(10);

    const out = deloadWeek(w).sessions[0].exercises;
    for (const e of out) for (const s of e.prescribedSets) expect(s.amrap).toBe(false);
    const lone = out[2].prescribedSets[0];
    expect(lone.reps).toBeGreaterThan(0);
  });

  test("timed sets keep their duration", () => {
    const w = week([[set(1, { reps: 0, durationSeconds: 45 }), set(2, { reps: 0, durationSeconds: 45 })]]);
    const [s] = deloadWeek(w).sessions[0].exercises[0].prescribedSets;
    expect(s.durationSeconds).toBe(45);
    expect(s.reps).toBe(0);
  });

  test("leaves cardio sessions and the input untouched", () => {
    const w = week([[set(1, { targetWeightKg: 100 }), set(2, { targetWeightKg: 100 })]]);
    const before = structuredClone(w);
    const out = deloadWeek(w);
    expect(w).toEqual(before);
    expect(out.sessions[1]).toEqual(before.sessions[1]);
    expect(out.week).toBe(4);
  });
});

describe("deload description", () => {
  test("describes the same rules the function applies", () => {
    expect(DELOAD_RULES).toContain("half the sets");
    expect(DELOAD_RULES).toContain("10");
    expect(DELOAD_RULES).toContain("RPE 6");
    expect(DELOAD_RULES).toContain("no AMRAP");
  });

  test("the volume target matches half the sets at −10% load", () => {
    expect(DELOAD_VOLUME_DELTA_PERCENT).toBe(-55);
  });
});
