import { describe, expect, test } from "bun:test";
import { e1rmAtRpe, loadFor, roundLoad, type E1rmHistorySet, type Equipment } from "@pt/shared";
import { chipFor, coachSheet, historySets, rpeOff, type CoachCtx, type CoachRow } from "./logCoach";
import { rowsToSave } from "./logSheet";

const row = (over: Partial<CoachRow> = {}): CoachRow => ({
  key: `pe1-${over.setNumber ?? 1}`,
  exerciseId: "squat",
  slotExerciseId: "squat",
  programExerciseId: "pe1",
  setNumber: 1,
  type: "working",
  prescribedReps: 5,
  weight: "",
  reps: "",
  rpe: "",
  rx: { reps: 5, amrap: false, targetRpe: 7, targetWeightKg: null },
  timed: false,
  ...over,
});

const equipment: Record<string, Equipment> = { squat: "barbell", curl: "dumbbell", pushup: "bodyweight" };
const history: E1rmHistorySet[] = [{ exerciseId: "squat", date: "2026-11-02", kg: 100, reps: 5, rpe: 8 }]; // e1RM 123.3
const ctx = (over: Partial<CoachCtx> = {}): CoachCtx => ({
  equipmentOf: (id) => equipment[id],
  history,
  stored: null,
  now: "2026-11-09",
  ...over,
});

const at = (e1rm: number, reps: number, rpe: number, eq: Equipment = "barbell") => roundLoad(loadFor(e1rm, reps, rpe), eq);

describe("suggested load", () => {
  test("an RPE-only set gets a load from history, with its source", () => {
    const c = coachSheet([row()], ctx());
    expect(c.suggest.get("pe1-1")).toEqual({ kg: at(123.3, 5, 7)!, source: "From Nov 2, 100 × 5 @ 8 · e1RM 123.3", adjusted: false });
    expect(c.suggest.get("pe1-1")!.kg).toBe(95);
  });

  test("no target RPE, a timed hold, an AMRAP or an extra set → no suggestion", () => {
    const rows = [
      row({ setNumber: 1, rx: { reps: 5, amrap: false, targetRpe: null } }),
      row({ setNumber: 2, timed: true }),
      row({ setNumber: 3, rx: { reps: 5, amrap: true, targetRpe: 9 } }),
      row({ setNumber: 4, rx: null, extra: true }),
    ];
    expect(coachSheet(rows, ctx()).suggest.size).toBe(0);
  });

  test("bodyweight moves get no load; dumbbells round to 2 kg", () => {
    const h: E1rmHistorySet[] = [
      { exerciseId: "pushup", date: "2026-11-02", kg: 10, reps: 10, rpe: 8 },
      { exerciseId: "curl", date: "2026-11-02", kg: 16, reps: 10, rpe: 8 },
    ];
    const c = coachSheet([row({ exerciseId: "pushup" }), row({ key: "c", exerciseId: "curl" })], ctx({ history: h }));
    expect(c.suggest.has("pe1-1")).toBe(false);
    expect(c.suggest.get("c")!.kg % 2).toBe(0);
  });

  test("a range suggests for its bottom", () => {
    const c = coachSheet([row({ rx: { reps: 10, repsMin: 8, amrap: false, targetRpe: 8 } })], ctx());
    expect(c.suggest.get("pe1-1")!.kg).toBe(at(123.3, 8, 8));
  });

  test("falls back to the stored 1RM", () => {
    const c = coachSheet([row()], ctx({ history: [], stored: { squat: { kg: 140, date: "2026-10-01" } } }));
    expect(c.suggest.get("pe1-1")).toMatchObject({ kg: at(140, 5, 7), source: "From stored 1RM · e1RM 140" });
  });

  test("a typed kg is never second-guessed", () => {
    expect(coachSheet([row({ weight: 90 })], ctx()).suggest.size).toBe(0);
  });

  test("a filled-down kg stays; the suggestion is offered as a chip against it", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 9 }), row({ setNumber: 2, weight: 100, copied: ["weight"] })];
    const c = coachSheet(rows, ctx());
    const s = c.suggest.get("pe1-2")!;
    expect(s.kg).toBeLessThan(100);
    expect(rows[1].weight).toBe(100);
    expect(chipFor(rows[1], s, "barbell")).toBe(s.kg);
    expect(chipFor(row({ weight: 100 }), s, "barbell")).toBeNull();
    expect(c.adjusted.get("pe1")).toContain("set 1 ran hot");
  });

  test("an on-target set today becomes the source", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 7 }), row({ setNumber: 2 })];
    const c = coachSheet(rows, ctx());
    expect(c.suggest.get("pe1-2")).toMatchObject({ kg: 100, adjusted: false });
    expect(c.suggest.get("pe1-2")!.source).toStartWith("From today's set 1: 100 × 5 @ 7");
    expect(c.adjusted.size).toBe(0);
  });
});

describe("autoregulation", () => {
  test("a hot set moves the later sets down, with a line saying why", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 9 }), row({ setNumber: 2 }), row({ setNumber: 3 })];
    const c = coachSheet(rows, ctx());
    const want = at(e1rmAtRpe(100, 5, 9), 5, 7)!;
    expect(want).toBeLessThan(100);
    expect(c.suggest.get("pe1-2")).toMatchObject({ kg: want, adjusted: true });
    expect(c.suggest.get("pe1-3")!.kg).toBe(want);
    expect(c.adjusted.get("pe1")).toBe(`Next sets adjusted to ${want} (set 1 ran hot)`);
  });

  test("a hot set after a good one still retargets — from the hot set", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 7 }), row({ setNumber: 2, weight: 100, reps: 5, rpe: 8.5 }), row({ setNumber: 3 })];
    const c = coachSheet(rows, ctx());
    expect(c.suggest.get("pe1-3")).toMatchObject({ kg: at(e1rmAtRpe(100, 5, 8.5), 5, 7), adjusted: true });
    expect(c.adjusted.get("pe1")).toContain("set 2 ran hot");
  });

  test("an easy set moves them up", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 5 }), row({ setNumber: 2 })];
    const c = coachSheet(rows, ctx());
    expect(c.suggest.get("pe1-2")!.kg).toBeGreaterThan(100);
    expect(c.adjusted.get("pe1")).toContain("ran easy");
  });

  test("the plan's kg stays; the chip shows only a step away", () => {
    const planned = { reps: 5, amrap: false, targetRpe: 7, targetWeightKg: 100 };
    const rows = [row({ weight: 100, reps: 5, rpe: 9, rx: planned }), row({ setNumber: 2, rx: planned })];
    const c = coachSheet(rows, ctx());
    const s = c.suggest.get("pe1-2");
    expect(chipFor(rows[1], s, "barbell")).toBe(s!.kg);
    // On target: today's set gives the plan back, so no chip.
    const calm = coachSheet([row({ weight: 100, reps: 5, rpe: 7, rx: planned }), row({ setNumber: 2, rx: planned })], ctx());
    expect(chipFor(rows[1], calm.suggest.get("pe1-2"), "barbell")).toBeNull();
    // No planned kg → no chip (the suggestion is the placeholder instead).
    expect(chipFor(row(), { kg: 80, source: "", adjusted: false }, "barbell")).toBeNull();
  });

  test("suggestions never make a row save", () => {
    const rows = [row({ weight: 100, reps: 5, rpe: 9 }), row({ setNumber: 2 }), row({ setNumber: 3 })];
    expect(coachSheet(rows, ctx()).suggest.size).toBe(2);
    expect(rowsToSave(rows).map((r) => r.key)).toEqual(["pe1-1"]);
  });
});

describe("feedback", () => {
  test("e1RM once kg and reps are in", () => {
    const c = coachSheet([row({ weight: 100, reps: 5, rpe: 8 }), row({ setNumber: 2, weight: 100 })], ctx());
    expect(c.feedback.get("pe1-1")?.e1rm).toBe(123.3);
    expect(c.feedback.has("pe1-2")).toBe(false);
  });

  test("PR: plain Epley beats every logged set — once per new best", () => {
    // History best plain e1RM: 100 × 5 → 116.7.
    const rows = [
      row({ weight: 105, reps: 5, rpe: 9 }), // 122.5 → PR
      row({ setNumber: 2, weight: 105, reps: 5 }), // ties today's best → no
      row({ setNumber: 3, weight: 95, reps: 5 }), // below → no
    ];
    const c = coachSheet(rows, ctx());
    expect([1, 2, 3].map((n) => c.feedback.get(`pe1-${n}`)?.pr)).toEqual([true, false, false]);
  });

  test("no history, no PR", () => {
    const c = coachSheet([row({ weight: 105, reps: 5 })], ctx({ history: [] }));
    expect(c.feedback.get("pe1-1")?.pr).toBe(false);
  });

  test("RPE off target: ≥ 1 over or ≥ 1.5 under", () => {
    expect(rpeOff(8, 7)).toEqual({ actual: 8, target: 7, dir: "hot" });
    expect(rpeOff(7.5, 7)).toBeNull();
    expect(rpeOff(6, 7)).toBeNull();
    expect(rpeOff(5.5, 7)).toEqual({ actual: 5.5, target: 7, dir: "easy" });
    expect(rpeOff(null, 7)).toBeNull();
    expect(rpeOff(9, null)).toBeNull();
  });

  test("the RPE chip shows on a bodyweight set too, but not on an AMRAP", () => {
    const rows = [
      row({ exerciseId: "pushup", reps: 10, rpe: 9 }),
      row({ setNumber: 2, reps: 8, rpe: 10, rx: { reps: 5, amrap: true, targetRpe: 9 } }),
    ];
    const c = coachSheet(rows, ctx());
    expect(c.feedback.get("pe1-1")).toEqual({ e1rm: null, pr: false, rpeOff: { actual: 9, target: 7, dir: "hot" } });
    expect(c.feedback.has("pe1-2")).toBe(false);
  });
});

describe("back-off sets", () => {
  const top = { reps: 3, amrap: false, targetRpe: 8, targetWeightKg: 120 };
  const off = { reps: 6, amrap: false, targetRpe: 7, targetWeightKg: 100 };

  test("with a target RPE: from today's top set e1RM", () => {
    const rows = [row({ weight: 120, reps: 3, rpe: 8, rx: top }), row({ setNumber: 2, type: "backoff", rx: off })];
    const c = coachSheet(rows, ctx());
    expect(c.suggest.get("pe1-2")!.kg).toBe(at(e1rmAtRpe(120, 3, 8), 6, 7));
  });

  test("without one: the plan's drop applied to today's top set", () => {
    const offNoRpe = { ...off, targetRpe: null };
    const rows = [
      row({ weight: 130, reps: 3, rx: { ...top, targetRpe: null } }),
      row({ setNumber: 2, type: "backoff", rx: offNoRpe }),
    ];
    const c = coachSheet(rows, ctx());
    // 100 / 120 of 130 = 108.3 → 107.5
    expect(c.suggest.get("pe1-2")).toEqual({ kg: 107.5, source: "83% of today's top set (130 kg), as planned", adjusted: false });
    // Before the top set is in, nothing to follow.
    expect(coachSheet([row({ rx: top }), rows[1]], ctx()).suggest.has("pe1-2")).toBe(false);
  });
});

test("historySets flattens logs and marks holds", () => {
  const out = historySets(
    [{ date: "2026-11-02T00:00:00Z", sets: [{ exerciseId: "plank", reps: 60 }, { exerciseId: "squat", weightKg: 100, reps: 5, rpe: 8 }] }],
    (s) => s.exerciseId === "plank"
  );
  expect(out).toEqual([
    { exerciseId: "plank", date: "2026-11-02", kg: null, reps: 60, rpe: null, timed: true },
    { exerciseId: "squat", date: "2026-11-02", kg: 100, reps: 5, rpe: 8, timed: false },
  ]);
});
