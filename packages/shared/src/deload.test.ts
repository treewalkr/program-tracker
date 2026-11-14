import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DELOAD,
  DELOAD_RULES,
  DELOAD_VOLUME_DELTA_PERCENT,
  DeloadSettings,
  deloadLoad,
  deloadRulesText,
  deloadSetCount,
  deloadVolumeDeltaPercent,
  deloadWeek,
  deloadBasisWeek,
  effectiveDeload,
} from "./deload";
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

describe("custom deload settings", () => {
  const custom = (p: Partial<DeloadSettings>): DeloadSettings => ({ ...DEFAULT_DELOAD, ...p });
  const w1 = week([[set(1, { targetWeightKg: 120 }), set(2, { targetWeightKg: 120 }), set(3, { targetWeightKg: 120 })], [set(1, { targetWeightKg: 40 })]]);
  const w3 = week([
    [set(1, { targetWeightKg: 140 }), set(2, { targetWeightKg: 140 }), set(3, { targetWeightKg: 140 })],
    [set(1, { targetWeightKg: 50 })],
    [set(1, { targetWeightKg: 30 })],
  ]);

  test("keeps the set share rounded up, at least one", () => {
    const sets = (pct: number, n: number) => deloadWeek(week([Array.from({ length: n }, (_, i) => set(i + 1))]), custom({ setsKeptPercent: pct })).sessions[0].exercises[0].prescribedSets.length;
    expect(sets(100, 4)).toBe(4);
    expect(sets(75, 4)).toBe(3);
    expect(sets(60, 5)).toBe(3);
    expect(sets(25, 1)).toBe(1);
    expect(sets(25, 5)).toBe(2);
    expect(deloadSetCount(4, custom({ setsKeptPercent: 50 }))).toBe(2);
  });

  test("applies the custom load change", () => {
    expect(deloadLoad(100, custom({ loadPercent: -20 }))).toBe(80);
    expect(deloadLoad(100, custom({ loadPercent: 0 }))).toBe(100);
    expect(deloadLoad(101, custom({ loadPercent: 0 }))).toBeLessThanOrEqual(101);
  });

  test("week-1 basis takes each slot's week-1 load; a slot new since week 1 uses last week's", () => {
    const out = deloadWeek(w3, custom({ loadBasis: "week1", setsKeptPercent: 100 }), w1).sessions[0].exercises;
    expect(out[0].prescribedSets.map((s) => s.targetWeightKg)).toEqual([107.5, 107.5, 107.5]);
    expect(out[1].prescribedSets[0].targetWeightKg).toBe(35);
    expect(out[2].prescribedSets[0].targetWeightKg).toBe(27.5);
  });

  test("week-1 basis without week 1 falls back to last week", () => {
    const out = deloadWeek(w3, custom({ loadBasis: "week1" })).sessions[0].exercises;
    expect(out[0].prescribedSets[0].targetWeightKg).toBe(125);
  });

  test("no RPE cap leaves RPE as written", () => {
    const w = week([[set(1, { targetRpe: 8.5 }), set(2)]]);
    const [a] = deloadWeek(w, custom({ rpeCap: null })).sessions[0].exercises[0].prescribedSets;
    expect(a.targetRpe).toBe(8.5);
    const [b] = deloadWeek(week([[set(1)]]), custom({ rpeCap: null })).sessions[0].exercises[0].prescribedSets;
    expect(b.targetRpe).toBeUndefined();
  });

  test("a custom cap trims an RPE range that no longer fits", () => {
    const [s] = deloadWeek(week([[set(1, { targetRpeMin: 7, targetRpe: 8 })]]), custom({ rpeCap: 6.5 })).sessions[0].exercises[0].prescribedSets;
    expect(s.targetRpe).toBe(6.5);
    expect(s.targetRpeMin).toBeUndefined();
  });

  test("AMRAP kept when the rule says so", () => {
    const w = week([[set(1, { reps: 0, amrap: true, stopRpe: 9 })]]);
    const [s] = deloadWeek(w, custom({ amrap: true, rpeCap: null })).sessions[0].exercises[0].prescribedSets;
    expect(s.amrap).toBe(true);
    expect(s.reps).toBe(0);
    expect(s.stopRpe).toBe(9);
    const [off] = deloadWeek(w).sessions[0].exercises[0].prescribedSets;
    expect(off.amrap).toBe(false);
    expect(off.stopRpe).toBeUndefined();
  });
});

describe("deloadRulesText", () => {
  test("the default text is DELOAD_RULES", () => {
    expect(deloadRulesText()).toBe(DELOAD_RULES);
    expect(DELOAD_RULES).toBe("half the sets per exercise (rounded up), loads −10 % from last week, RPE 6 cap, no AMRAP sets");
  });

  test("describes a custom rule", () => {
    expect(deloadRulesText({ setsKeptPercent: 60, loadPercent: -7.5, loadBasis: "week1", rpeCap: null, amrap: true })).toBe(
      "60 % of the sets per exercise (rounded up), loads −7.5 % from week 1, no RPE cap, AMRAP sets kept"
    );
    expect(deloadRulesText({ ...DEFAULT_DELOAD, setsKeptPercent: 100, loadPercent: 0, rpeCap: 6.5 })).toBe(
      "all sets kept, loads as last week, RPE 6.5 cap, no AMRAP sets"
    );
  });
});

describe("deloadVolumeDeltaPercent", () => {
  test("sets kept × load factor − 1", () => {
    expect(deloadVolumeDeltaPercent()).toBe(-55);
    expect(deloadVolumeDeltaPercent({ ...DEFAULT_DELOAD, setsKeptPercent: 100, loadPercent: -20 })).toBe(-20);
    expect(deloadVolumeDeltaPercent({ ...DEFAULT_DELOAD, setsKeptPercent: 60, loadPercent: 0 })).toBe(-40);
  });
});

describe("effectiveDeload", () => {
  const mine: DeloadSettings = { ...DEFAULT_DELOAD, setsKeptPercent: 70 };
  const theirs: DeloadSettings = { ...DEFAULT_DELOAD, rpeCap: null };

  test("client override, else trainer, else defaults", () => {
    expect(effectiveDeload(mine, theirs)).toEqual(theirs);
    expect(effectiveDeload(mine, null)).toEqual(mine);
    expect(effectiveDeload(null)).toEqual(DEFAULT_DELOAD);
  });

  test("skips invalid settings", () => {
    expect(effectiveDeload(mine, { setsKeptPercent: 10 })).toEqual(mine);
    expect(effectiveDeload({ ...mine, loadPercent: 5 }, "x")).toEqual(DEFAULT_DELOAD);
    expect(DeloadSettings.safeParse({ ...DEFAULT_DELOAD, loadPercent: -3 }).success).toBe(false);
    expect(DeloadSettings.safeParse({ ...DEFAULT_DELOAD, extra: 1 }).success).toBe(false);
  });
});

describe("deloadBasisWeek", () => {
  const wk = (week: number, rotation?: "A" | "B") => ({ week, ...(rotation ? { rotation } : {}), sessions: [] });

  test("week 1 without letters; the first same-letter week in an A/B block", () => {
    expect(deloadBasisWeek([wk(1), wk(2), wk(3), wk(4)], 4)?.week).toBe(1);
    const ab = [wk(1, "A"), wk(2, "B"), wk(3, "A"), wk(4, "B")];
    expect(deloadBasisWeek(ab, 4)?.week).toBe(2);
    expect(deloadBasisWeek(ab, 3)?.week).toBe(1);
  });
});
