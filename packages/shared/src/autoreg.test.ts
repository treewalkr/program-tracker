import { describe, expect, test } from "bun:test";
import { bestE1rm, e1rmAtRpe, estimate1rm, loadFor, roundLoad, shortDate } from "./index";

describe("e1rmAtRpe", () => {
  test("adds reps in reserve to Epley", () => {
    // 100 × 5 @ 8 → 2 in reserve → 100 × (1 + 7/30)
    expect(e1rmAtRpe(100, 5, 8)).toBe(123.3);
  });

  test("a missing RPE counts as 10 — the same as estimate1rm", () => {
    expect(e1rmAtRpe(100, 5)).toBe(estimate1rm(100, 5));
    expect(e1rmAtRpe(100, 5, null)).toBe(e1rmAtRpe(100, 5, 10));
    expect(e1rmAtRpe(80, 15)).toBe(estimate1rm(80, 15));
  });

  test("caps reps at 12 like estimate1rm", () => {
    expect(e1rmAtRpe(50, 20, 10)).toBe(e1rmAtRpe(50, 12, 10));
  });

  test("no load or no reps → 0", () => {
    expect(e1rmAtRpe(0, 5, 8)).toBe(0);
    expect(e1rmAtRpe(100, 0, 8)).toBe(0);
  });
});

describe("loadFor", () => {
  test("round-trips e1rmAtRpe", () => {
    for (const [kg, reps, rpe] of [[100, 5, 8], [62.5, 10, 7], [140, 1, 10], [80, 3, undefined]] as const) {
      expect(loadFor(e1rmAtRpe(kg, reps, rpe), reps, rpe)).toBeCloseTo(kg, 0);
    }
  });

  test("more reps or lower RPE → less load", () => {
    expect(loadFor(120, 8, 8)).toBeLessThan(loadFor(120, 5, 8));
    expect(loadFor(120, 5, 7)).toBeLessThan(loadFor(120, 5, 9));
  });
});

describe("roundLoad", () => {
  test("rounds down to 2.5 on barbells, machines, cables and other", () => {
    expect(roundLoad(104.9, "barbell")).toBe(102.5);
    expect(roundLoad(102.5, "barbell")).toBe(102.5);
    expect(roundLoad(41, "machine")).toBe(40);
    expect(roundLoad(23.4, "cable")).toBe(22.5);
    expect(roundLoad(9.9, "other")).toBe(7.5);
    expect(roundLoad(9.9, undefined)).toBe(7.5);
  });

  test("rounds down to 2 on dumbbells and kettlebells", () => {
    expect(roundLoad(27.9, "dumbbell")).toBe(26);
    expect(roundLoad(17, "kettlebell")).toBe(16);
  });

  test("no load for bodyweight, or when nothing fits", () => {
    expect(roundLoad(80, "bodyweight")).toBeNull();
    expect(roundLoad(1.5, "barbell")).toBeNull();
    expect(roundLoad(0, "barbell")).toBeNull();
  });
});

describe("bestE1rm", () => {
  const ex = "squat";
  const now = "2026-11-09";
  const history = [
    { exerciseId: ex, date: "2026-11-02", kg: 100, reps: 5, rpe: 8 }, // 123.3
    { exerciseId: ex, date: "2026-09-01", kg: 140, reps: 5, rpe: 8 }, // too old
    { exerciseId: ex, date: "2026-11-05", kg: 60, reps: 15, rpe: 7 }, // over 12 reps
    { exerciseId: ex, date: "2026-11-05", kg: 90, reps: 60, timed: true }, // a hold
    { exerciseId: "bench", date: "2026-11-05", kg: 150, reps: 5, rpe: 8 }, // another lift
  ];
  const stored = { [ex]: { kg: 150, date: "2026-08-01" } };

  test("today's best set wins", () => {
    const today = [
      { exerciseId: ex, setNumber: 1, kg: 100, reps: 5, rpe: 8.5 },
      { exerciseId: ex, setNumber: 2, kg: 105, reps: 5, rpe: 9.5 },
    ];
    const b = bestE1rm(ex, { today, history, stored, now });
    expect(b?.source.kind).toBe("today");
    expect(b?.e1rm).toBe(e1rmAtRpe(105, 5, 9.5));
    expect(b?.label).toBe("today's set 2: 105 × 5 @ 9.5");
  });

  test("then the last 6 weeks, ignoring old, high-rep and timed sets", () => {
    const b = bestE1rm(ex, { today: [], history, stored, now });
    expect(b?.source.kind).toBe("history");
    expect(b?.e1rm).toBe(123.3);
    expect(b?.label).toBe("Nov 2, 100 × 5 @ 8");
  });

  test("then the stored 1RM", () => {
    const b = bestE1rm(ex, { history: history.slice(1), stored, now });
    expect(b).toEqual({ e1rm: 150, source: { kind: "stored" }, label: "stored 1RM" });
  });

  test("nothing to go on → null", () => {
    expect(bestE1rm(ex, { now })).toBeNull();
    expect(bestE1rm(ex, { today: [{ exerciseId: ex, setNumber: 1, kg: null, reps: 5 }], now })).toBeNull();
  });

  test("history without RPE reads as RPE 10", () => {
    const b = bestE1rm(ex, { history: [{ exerciseId: ex, date: "2026-11-01", kg: 100, reps: 5 }], now });
    expect(b?.e1rm).toBe(estimate1rm(100, 5));
    expect(b?.label).toBe("Nov 1, 100 × 5");
  });
});

test("shortDate", () => {
  expect(shortDate("2026-01-09T10:00:00Z")).toBe("Jan 9");
});
