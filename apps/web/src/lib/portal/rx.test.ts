import { describe, expect, test } from "bun:test";
import type { PortalSet } from "@pt/shared";
import { en, format, th, type MessageKey } from "./messages";
import { cardioActualParts, cardioParts, coachIntensity, intervalLines, lastSetText, setParts } from "./rx";
import type { PortalCardioInterval } from "@pt/shared";
import { units } from "$lib/units.svelte";

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
    // an old preset slug says nothing; the coach's own words stay
    expect(cardioParts({ modality: "Run", durationMin: 40, hrZone: 2, intensity: "easy" }, tEn)).toEqual(["40 min", "zone 2"]);
    expect(cardioParts({ modality: "Run", durationMin: 40, intensity: "conversational" }, tEn)).toEqual(["40 min", "conversational"]);
    expect(["easy", "Tempo", "intervals", "long", "", null].map(coachIntensity)).toEqual([null, null, null, null, null, null]);
    expect(cardioActualParts({ durationSec: 2525, distanceKm: 6.4, rpe: 4 }, tTh)).toEqual(["42:05", "6.4 กม.", "RPE 4"]);
    expect(cardioActualParts({ durationMin: 30 }, tEn)).toEqual(["30:00"]);
    expect(cardioParts({ modality: "Run", durationMin: 40, hrZone: 2 }, tTh)).toEqual(["40 นาที", "โซน 2"]);
    expect(cardioParts({ durationMin: 40, hrZone: 2, hrBpm: { min: 136, max: 148 }, paceSecPerKm: 400 }, tEn)).toEqual(["40 min", "zone 2", "136–148 bpm", "6:40 /km"]);
  });

  const mockup: PortalCardioInterval[] = [
    { id: "w", type: "warmup", repeat: 1, durationSec: 600, hrZone: 2, hrBpm: { min: 123, max: 148 } },
    { id: "r", type: "work", repeat: 5, durationSec: 120, hrZone: 4, hrBpm: { min: 162, max: 174 }, rpe: 8, recovery: { type: "active_recovery", durationSec: 120 } },
    { id: "c", type: "cooldown", repeat: 1, durationSec: 300, hrZone: 1, hrBpm: { min: 123, max: 135 } },
  ];

  test("an interval session shows its total, never a zone chip; each block and its recovery a line", () => {
    expect(cardioParts({ targetRpe: 8, intervals: mockup }, tTh)).toEqual(["33 นาที", "RPE 8"]);
    const lines = intervalLines(mockup, tTh);
    expect(lines.map((l) => [l.name, l.amount, l.zone, l.bpm, l.extra])).toEqual([
      ["วอร์มอัพ", "10 นาที", "โซน 2", "123–148 bpm", null],
      ["ช่วงหนัก", "2 นาที × 5", "โซน 4", "162–174 bpm", "RPE 8"],
      ["พักแบบขยับเบา ๆ", "2 นาที × 4", null, null, "ระหว่างช่วงหนัก"],
      ["คูลดาวน์", "5 นาที", "โซน 1", "123–135 bpm", null],
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["easy", "work", "recovery", "easy"]);
  });

  test("distance and odd times read plainly", () => {
    const lines = intervalLines([{ id: "d", type: "work", repeat: 6, distanceM: 400, recovery: { type: "passive_recovery", durationSec: 90 }, recoveryAfterLast: true }], tEn);
    expect(lines.map((l) => [l.name, l.amount, l.extra])).toEqual([
      ["Hard reps", "400 m × 6", null],
      ["Rest", "1:30 min × 6", "after each hard rep"],
    ]);
  });
});

describe("last time", () => {
  test("kg × reps with the RPE the client gave; reps alone with no kg", () => {
    expect(lastSetText({ date: "2026-11-09", weightKg: 62.5, reps: 8, rpe: 8 }, tEn)).toBe("62.5 kg × 8 · RPE 8");
    expect(lastSetText({ date: "2026-11-09", weightKg: 60, reps: 8, rpe: null }, tTh)).toBe("60 กก. × 8");
    expect(lastSetText({ date: "2026-11-09", weightKg: null, reps: 10, rpe: null }, tEn)).toBe("BW × 10");
  });

  test("a set with no load reads as bodyweight, in both languages", () => {
    expect(lastSetText({ date: "2026-11-09", weightKg: 0, reps: 12, rpe: 7 }, tEn)).toBe("BW × 12 · RPE 7");
    expect(lastSetText({ date: "2026-11-09", weightKg: null, reps: 12, rpe: null }, tTh)).toBe("น้ำหนักตัว × 12");
  });
});

describe("the member's display units", () => {
  test("lb and miles convert what's shown; metres for track reps stay metres", () => {
    units.weight = "lb";
    units.distance = "mi";
    try {
      expect(setParts([S({ targetWeightKg: 60 })], tEn)).toEqual(["1 × 8", "≈ 132.5 lb"]);
      expect(setParts([S({ targetWeightKg: 60 })], tTh)).toEqual(["1 × 8", "≈ 132.5 ปอนด์"]);
      expect(lastSetText({ date: "2026-11-09", weightKg: 100, reps: 5, rpe: null }, tEn)).toBe("≈ 220 lb × 5");
      expect(cardioParts({ distanceKm: 5.2, paceSecPerKm: 406 }, tEn)).toEqual(["3.23 mi", "10:53 /mi"]);
      expect(intervalLines([{ id: "t", type: "work", repeat: 6, distanceM: 400 }], tEn)[0].amount).toBe("400 m × 6");
    } finally {
      units.weight = "kg";
      units.distance = "km";
    }
  });
});

describe("interval targets", () => {
  const tempo: PortalCardioInterval[] = [
    { id: "wu", type: "warmup", repeat: 1, durationSec: 300, hrZone: 2, notes: "easy jog, finish with 2 strides" },
    { id: "r", type: "work", repeat: 3, durationSec: 300, hrZone: 4, hrBpm: { min: 149, max: 168 }, paceSecPerKm: 320, recovery: { type: "active_recovery", durationSec: 60, hrZone: 1, paceSecPerKm: 420 } },
  ];
  test("a run shows pace per km, the recovery its own target, notes as written", () => {
    const lines = intervalLines(tempo, tEn, "pace");
    expect(lines[0].notes).toBe("easy jog, finish with 2 strides");
    expect(lines[1]).toMatchObject({ zone: "Zone 4", bpm: "149–168 bpm", extra: "5:20 /km" });
    expect(lines[2]).toMatchObject({ kind: "recovery", zone: "Zone 1", extra: "between hard reps · 7:00 /km" });
  });
  test("pace per mile on miles; a row reads a /500 m split, a bike km/h, an elliptical nothing", () => {
    units.distance = "mi";
    try {
      expect(intervalLines(tempo, tEn, "pace")[1].extra).toBe("8:35 /mi");
    } finally {
      units.distance = "km";
    }
    expect(intervalLines(tempo, tTh, "split")[1].extra).toBe("2:40 /500 ม.");
    expect(intervalLines(tempo, tEn, "speed")[1].extra).toBe("11.3 km/h");
    expect(intervalLines(tempo, tEn, "none")[1].extra).toBeNull();
    expect(cardioParts({ modality: "Rowing", paceSecPerKm: 220 }, tEn)).toEqual(["1:50 /500 m"]);
    expect(cardioParts({ modality: "Elliptical", durationMin: 30, paceSecPerKm: 220 }, tEn)).toEqual(["30 min"]);
  });
});

