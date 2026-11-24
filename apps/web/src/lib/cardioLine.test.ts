import { describe, expect, test } from "bun:test";
import { cardioLine, sessionLogTag } from "./cardioLine";

describe("cardioLine", () => {
  test("a prescription reads modality, time, zone, intensity, distance and target RPE", () => {
    expect(cardioLine({ modality: "Bike", durationMin: 40, hrZone: 2, intensity: "conversational", distanceKm: 15, targetRpe: 5 })).toBe(
      "Bike · 40 min · Z2 · conversational · 15 km · RPE 5",
    );
  });
  test("a log reads its RPE", () => {
    expect(cardioLine({ modality: "Run", durationMin: 35, hrZone: 2, distanceKm: 5.5, rpe: 6 })).toBe("Run · 35 min · Z2 · 5.5 km · RPE 6");
  });
  test("blank parts and no cardio read as nothing", () => {
    expect(cardioLine({ modality: "Row", durationMin: null, hrZone: null })).toBe("Row");
    expect(cardioLine(null)).toBe("");
  });
  test("an interval session reads its work and total, not stale steady targets", () => {
    const intervals = [
      { id: "w", type: "warmup" as const, repeat: 1, durationSec: 600 },
      { id: "r", type: "work" as const, repeat: 5, durationSec: 120, recovery: { type: "active_recovery" as const, durationSec: 120 } },
      { id: "c", type: "cooldown" as const, repeat: 1, durationSec: 300 },
    ];
    // 10 + 5×2 + 4×2 + 5 = 33 min
    expect(cardioLine({ modality: "Running", intervals, targetRpe: 8 })).toBe("Running · 5×2′ · 33:00 · RPE 8");
    expect(cardioLine({ modality: "Running", durationMin: 43, distanceKm: 8, intervals })).toBe("Running · 5×2′ · 33:00");
    expect(cardioLine({ modality: "Track", intervals: [{ id: "t", type: "work" as const, repeat: 6, distanceM: 400 }] })).toBe("Track · 6×400 m");
    expect(cardioLine({ modality: "Bike", intervals: [{ id: "t", type: "work" as const, repeat: 1, durationSec: 90 }] })).toBe("Bike · 1′30″ · 1:30");
  });
});

test("an old preset slug (easy, tempo, intervals, long) is left out", () => {
  expect(cardioLine({ modality: "Bike", durationMin: 60, hrZone: 2, intensity: "easy", targetRpe: 3 })).toBe("Bike · 60 min · Z2 · RPE 3");
});

describe("cardioLine bpm band", () => {
  test("the coach's band shows in place of the zone it overrides", () => {
    expect(cardioLine({ modality: "Cycling", durationMin: 60, hrZone: 2, hrBpm: { min: 135, max: 145 }, targetRpe: 3 })).toBe(
      "Cycling · 60 min · 135–145 bpm · RPE 3",
    );
  });
});

describe("sessionLogTag", () => {
  test("a real log reads Logged and its dates", () => {
    expect(sessionLogTag([{ date: "2026-11-24", cardio: { durationSec: 1800 } }])).toEqual({ done: true, text: "Logged Tue 24 Nov" });
  });
  test("a skip reads Not done with its reason, never Logged", () => {
    expect(sessionLogTag([{ date: "2026-11-24", cardio: { skipped: { reason: "time" } } }])).toEqual({
      done: false,
      text: "Not done · No time · Tue 24 Nov",
    });
  });
  test("a real log next to a skip counts only the real one as logged", () => {
    expect(
      sessionLogTag([
        { date: "2026-11-23", cardio: { skipped: { reason: "pain" } } },
        { date: "2026-11-24", cardio: { durationSec: 600 } },
      ]),
    ).toEqual({ done: true, text: "Logged Tue 24 Nov" });
  });
});
