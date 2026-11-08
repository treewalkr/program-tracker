import { describe, expect, test } from "bun:test";
import { Client, OneRepMaxes, oneRepMaxKg, plannedVolume, resolveLoadKg, roundToPlate } from "./index";

describe("OneRepMaxes", () => {
  test("maps exercise ids to a kg and the date it was set", () => {
    const m = OneRepMaxes.parse({ squat: { kg: 140, date: "2026-10-01" } });
    expect(m.squat).toEqual({ kg: 140, date: "2026-10-01" });
    expect(() => OneRepMaxes.parse({ squat: { kg: 0, date: "2026-10-01" } })).toThrow();
    expect(() => OneRepMaxes.parse({ squat: { kg: 140, date: "1 Oct" } })).toThrow();
  });

  test("the client carries them, nullable", () => {
    const c = { id: crypto.randomUUID(), trainerId: crypto.randomUUID(), name: "A", email: "a@x.io", createdAt: "2026-01-01" };
    expect(Client.parse({ ...c, oneRepMaxes: { s: { kg: 100, date: "2026-10-01" } } }).oneRepMaxes?.s.kg).toBe(100);
    expect(Client.parse({ ...c, oneRepMaxes: null }).oneRepMaxes).toBeNull();
  });
});

describe("resolveLoadKg", () => {
  test("rounds %1RM to the nearest 2.5 kg plate step", () => {
    expect(resolveLoadKg({ percent1rm: 75 }, 140)).toBe(105);
    expect(resolveLoadKg({ percent1rm: 82 }, 140)).toBe(115); // 114.8
    expect(roundToPlate(113.7)).toBe(112.5);
  });

  test("%1RM wins when the 1RM is known, else the kg target is the fallback", () => {
    expect(resolveLoadKg({ percent1rm: 80, targetWeightKg: 100 }, 150)).toBe(120);
    expect(resolveLoadKg({ percent1rm: 80, targetWeightKg: 100 }, null)).toBe(100);
    expect(resolveLoadKg({ percent1rm: 80 }, undefined)).toBeNull();
    expect(resolveLoadKg({ targetWeightKg: 60 }, 150)).toBe(60);
    expect(resolveLoadKg({ targetWeightKg: null }, 150)).toBeNull();
  });

  test("oneRepMaxKg looks the exercise up", () => {
    const m = { sq: { kg: 140, date: "2026-10-01" } };
    expect(oneRepMaxKg(m, "sq")).toBe(140);
    expect(oneRepMaxKg(m, "bench")).toBeNull();
    expect(oneRepMaxKg(null, "sq")).toBeNull();
  });
});

describe("plannedVolume", () => {
  const session = (sets: object[], exerciseId = "sq") => ({
    kind: "lifting" as const,
    exercises: [{ exerciseId, prescribedSets: sets as never }],
  });

  test("Σ resolved kg × reps; ranges count their bottom, timed sets never count", () => {
    const s = session([
      { reps: 5, amrap: false, targetWeightKg: 100 },
      { reps: 10, repsMin: 8, amrap: false, percent1rm: 50 },
      { reps: 0, amrap: false, durationSeconds: 30, targetWeightKg: 20 },
    ]);
    expect(plannedVolume([s], { sq: { kg: 140, date: "2026-10-01" } })).toBe(5 * 100 + 8 * 70);
  });

  test("null when nothing has a resolvable load (not 0)", () => {
    expect(plannedVolume([session([{ reps: 5, amrap: false, percent1rm: 75 }])], null)).toBeNull();
    expect(plannedVolume([session([{ reps: 10, amrap: false }])], null)).toBeNull();
    expect(plannedVolume([], null)).toBeNull();
  });

  test("an AMRAP counts its minimum reps", () => {
    expect(plannedVolume([session([{ reps: 5, amrap: true, targetWeightKg: 100 }])], null)).toBe(500);
  });
});
