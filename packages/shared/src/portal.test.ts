import { describe, expect, test } from "bun:test";
import { lastWeightsOf } from "./portal";

describe("lastWeightsOf", () => {
  test("newest log wins per exercise and set; the exercise key holds its latest load; no-kg sets are ignored", () => {
    const w = lastWeightsOf([
      { date: "2026-11-10", sets: [{ exerciseId: "a", setNumber: 1, weightKg: "60.00" }, { exerciseId: "a", setNumber: 2, weightKg: 62.5 }] },
      { date: "2026-11-03", sets: [{ exerciseId: "a", setNumber: 1, weightKg: 50 }, { exerciseId: "a", setNumber: 3, weightKg: 55 }] },
      { date: "2026-11-12", sets: [{ exerciseId: "a", setNumber: 1, weightKg: null }, { exerciseId: "b", setNumber: 1, weightKg: 0 }] },
    ]);
    expect(w.get("a#1")).toBe(60);
    expect(w.get("a#2")).toBe(62.5);
    expect(w.get("a#3")).toBe(55);
    expect(w.get("a")).toBe(62.5);
    expect(w.has("b")).toBe(false);
  });
});
