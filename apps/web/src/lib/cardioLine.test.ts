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
});
