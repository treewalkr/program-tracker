import { describe, expect, test } from "bun:test";
import { cardioDone, cardioUnitLabel, cardioWeekTotals, isoWeekStart } from "./cardio";

describe("isoWeekStart", () => {
  test("returns the Monday", () => {
    expect(isoWeekStart(new Date(2026, 9, 29))).toBe("2026-10-26"); // Thursday → its Monday
    expect(isoWeekStart(new Date(2026, 9, 26))).toBe("2026-10-26"); // Monday edge → itself
    expect(isoWeekStart(new Date(2026, 9, 25))).toBe("2026-10-19"); // Sunday → previous Monday
    expect(isoWeekStart(new Date(2027, 0, 3))).toBe("2026-12-28"); // Sunday spanning year boundary
  });
});

describe("cardioWeekTotals", () => {
  test("sums minutes, sessions and zone-minutes since week start", () => {
    const logs = [
      { date: "2026-10-26", kind: "cardio", cardio: { modality: "Run", durationMin: 40, hrZone: 3 } },
      { date: "2026-10-28", kind: "cardio", cardio: { modality: "Bike", durationMin: 35 } }, // no hrZone → ×1
      { date: "2026-10-29", kind: "cardio", cardio: { modality: "Row" } }, // no duration → session only
      { date: "2026-10-25", kind: "cardio", cardio: { modality: "Run", durationMin: 60, hrZone: 2 } }, // before since
      { date: "2026-10-27", kind: "lifting", sets: [] }, // lifting ignored
      { date: "2026-10-27", cardio: { modality: "Run", durationMin: 30 } }, // missing kind ignored
    ];
    const totals = cardioWeekTotals(logs as any, "2026-10-26");
    expect(totals).toEqual({ minutes: 75, sessions: 3, zoneMinutes: 155 });
  });

  test("empty week is all zeros", () => {
    expect(cardioWeekTotals([], "2026-10-26")).toEqual({ minutes: 0, sessions: 0, zoneMinutes: 0 });
  });
});

describe("cardioDone", () => {
  const totals = { minutes: 75, sessions: 3, zoneMinutes: 155 };

  test("maps the target unit onto the totals", () => {
    expect(cardioDone({ unit: "minutes", value: 150 }, totals)).toBe(75);
    expect(cardioDone({ unit: "sessions", value: 4 }, totals)).toBe(3);
    expect(cardioDone({ unit: "zone_minutes", value: 200 }, totals)).toBe(155);
  });
});

describe("cardioUnitLabel", () => {
  test("one label per unit", () => {
    expect(cardioUnitLabel("minutes")).toBe("min");
    expect(cardioUnitLabel("sessions")).toBe("sessions");
    expect(cardioUnitLabel("zone_minutes")).toBe("zone-min");
  });
});
