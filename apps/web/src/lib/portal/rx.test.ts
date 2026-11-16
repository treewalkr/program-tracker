import { describe, expect, test } from "bun:test";
import type { PortalSet } from "@pt/shared";
import { en, format, th, type MessageKey } from "./messages";
import { cardioParts, lastSetText, setParts } from "./rx";

const tEn = (k: MessageKey, v?: Record<string, string | number>) => format(en[k], v);
const tTh = (k: MessageKey, v?: Record<string, string | number>) => format(th[k], v);
const S = (over: Partial<PortalSet> = {}): PortalSet => ({ setNumber: 1, type: "working", reps: 8, amrap: false, targetWeightKg: null, ...over });

describe("portal prescription text", () => {
  test("uniform sets collapse to sets × reps with load, effort and rest", () => {
    const sets = [1, 2, 3, 4].map((n) => S({ setNumber: n, reps: 12, repsMin: 8, targetWeightKg: 60, targetRpe: 8, restSeconds: 120 }));
    expect(setParts(sets, tEn)).toEqual(["4 × 8–12", "60 kg", "RPE 8", "rest 2 min"]);
    expect(setParts(sets, tTh)).toEqual(["4 × 8–12", "60 กก.", "RPE 8", "พัก 2 นาที"]);
  });

  test("a pyramid lists each set; climbing effort shows its ends", () => {
    const sets = [10, 8, 6].map((reps, i) => S({ setNumber: i + 1, reps, targetWeightKg: 50 + i * 5, targetRpe: 7 + i }));
    expect(setParts(sets, tEn)).toEqual(["10 / 8 / 6", "50 / 55 / 60 kg", "RPE 7→9"]);
  });

  test("timed and to-failure sets", () => {
    expect(setParts([S({ reps: 0, durationSeconds: 30 }), S({ reps: 0, durationSeconds: 30 })], tEn)).toEqual(["2 × 30 s"]);
    expect(setParts([S({ reps: 0, amrap: true })], tEn)).toEqual(["1 × as many as you can"]);
    expect(setParts([S({ reps: 0, amrap: true })], tTh)).toEqual(["1 × ให้ได้มากที่สุด"]);
  });

  test("cardio", () => {
    expect(cardioParts({ modality: "Run", durationMin: 40, hrZone: 2, intensity: "easy" }, tEn)).toEqual(["40 min", "zone 2", "easy"]);
    expect(cardioParts({ modality: "Run", durationMin: 40, hrZone: 2 }, tTh)).toEqual(["40 นาที", "โซน 2"]);
  });
});

describe("last time", () => {
  test("kg × reps with the RPE the client gave; reps alone with no kg", () => {
    expect(lastSetText({ date: "2026-11-09", weightKg: 62.5, reps: 8, rpe: 8 }, tEn)).toBe("62.5 kg × 8 · RPE 8");
    expect(lastSetText({ date: "2026-11-09", weightKg: 60, reps: 8, rpe: null }, tTh)).toBe("60 กก. × 8");
    expect(lastSetText({ date: "2026-11-09", weightKg: null, reps: 10, rpe: null }, tEn)).toBe("10 reps");
  });
});
