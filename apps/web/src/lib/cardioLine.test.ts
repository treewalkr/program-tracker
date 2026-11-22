import { describe, expect, test } from "bun:test";
import { cardioLine } from "./cardioLine";

describe("cardioLine", () => {
  test("a prescription reads modality, time, zone, intensity, distance and target RPE", () => {
    expect(cardioLine({ modality: "Bike", durationMin: 40, hrZone: 2, intensity: "easy", distanceKm: 15, targetRpe: 5 })).toBe(
      "Bike · 40 min · Z2 · easy · 15 km · RPE 5",
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
