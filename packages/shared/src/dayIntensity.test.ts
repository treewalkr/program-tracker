import { expect, test } from "bun:test";
import { dayIntensityLevels, dayVolume, intensityLevel, volumeBaseline } from "./dayIntensity";

const lift = (sets: { weightKg?: number | null; reps: number; exerciseId?: string }[]) => ({
  kind: "lifting",
  sets: sets.map((s) => ({ exerciseId: s.exerciseId ?? "squat", type: "working" as const, reps: s.reps, weightKg: s.weightKg ?? null })),
});
const cardio = (durationMin: number | null) => ({ kind: "cardio", cardio: { modality: "Run", durationMin }, sets: [] });

test("a lifting day measures kg × reps tonnage", () => {
  expect(dayVolume([lift([{ weightKg: 100, reps: 5 }, { weightKg: 60, reps: 10 }])])).toEqual({ basis: "tonnage", amount: 1100 });
});

test("timed holds never count toward tonnage", () => {
  const v = dayVolume([lift([{ weightKg: 100, reps: 5 }, { weightKg: 20, reps: 60, exerciseId: "plank" }])], new Set(["plank"]));
  expect(v).toEqual({ basis: "tonnage", amount: 500 });
});

test("a day with no loaded sets falls back to set count", () => {
  expect(dayVolume([lift([{ reps: 10 }, { reps: 10 }, { reps: 8 }])])).toEqual({ basis: "sets", amount: 3 });
});

test("a cardio-only day measures minutes; lifting on the same day wins", () => {
  expect(dayVolume([cardio(30), cardio(15)])).toEqual({ basis: "minutes", amount: 45 });
  expect(dayVolume([cardio(30), lift([{ weightKg: 50, reps: 10 }])])).toEqual({ basis: "tonnage", amount: 500 });
});

test("a cardio log with no duration still counts as one session", () => {
  expect(dayVolume([cardio(null)])).toEqual({ basis: "sessions", amount: 1 });
});

test("no logs → null", () => {
  expect(dayVolume([])).toBeNull();
});

test("baseline is the quartiles of the logged days", () => {
  expect(volumeBaseline([100, 200, 300, 400, 500])).toEqual({ q1: 200, median: 300, q3: 400 });
  expect(volumeBaseline([700])).toEqual({ q1: 700, median: 700, q3: 700 });
});

test("level: below Q1 → 1, below median → 2, up to Q3 → 3, above → 4", () => {
  const b = volumeBaseline([100, 200, 300, 400, 500]);
  expect([100, 250, 300, 400, 900].map((v) => intensityLevel(v, b))).toEqual([1, 2, 3, 3, 4]);
});

test("a usual day reads level 3 when every day is the same", () => {
  const b = volumeBaseline([500, 500, 500]);
  expect(intensityLevel(500, b)).toBe(3);
});

test("one heavy day doesn't wash out the rest", () => {
  const days = [1000, 1100, 1200, 1000, 10000].map((amount) => ({ basis: "tonnage" as const, amount }));
  const levels = dayIntensityLevels(days);
  expect(levels[4]).toBe(4);
  expect(levels.slice(0, 4).every((l) => l >= 1 && l <= 3)).toBe(true);
  expect(levels[2]).toBe(3);
});

test("cardio days compare against the usual cardio day, not lifting tonnage", () => {
  const levels = dayIntensityLevels([
    { basis: "tonnage", amount: 5000 },
    { basis: "tonnage", amount: 5000 },
    { basis: "minutes", amount: 40 },
    { basis: "minutes", amount: 40 },
  ]);
  expect(levels).toEqual([3, 3, 3, 3]);
});

test("a day without volume is level 0", () => {
  expect(dayIntensityLevels([null, { basis: "sets", amount: 4 }])).toEqual([0, 3]);
});
