import { describe, expect, test } from "bun:test";
import {
  displayUnitsOf,
  distanceFrom,
  distanceIn,
  formatDistance,
  formatPace,
  formatSpeed,
  formatWeight,
  parseDistance,
  parseWeight,
  snapWeight,
  weightFrom,
  weightIn,
  weightStep,
} from "./units";

describe("weight", () => {
  test("135 lb → kg → 135 lb", () => {
    const kg = weightFrom(135, "lb");
    expect(kg).toBe(61.23);
    expect(weightIn(kg, "lb")).toBe(135);
  });

  test("every whole lb 1–600 survives the round trip", () => {
    for (let lb = 1; lb <= 600; lb++) expect(weightIn(weightFrom(lb, "lb"), "lb")).toBe(lb);
  });

  test("kg is unchanged in kg", () => {
    expect(weightIn(102.5, "kg")).toBe(102.5);
    expect(weightFrom(102.5, "kg")).toBe(102.5);
  });

  test("steps: 2.5 kg ↔ 5 lb", () => {
    expect(weightStep("kg")).toBe(2.5);
    expect(weightStep("lb")).toBe(5);
    expect(snapWeight(137, "lb")).toBe(135);
    expect(snapWeight(61.3, "kg")).toBe(62.5);
  });

  test("format and parse", () => {
    expect(formatWeight(100, "kg")).toBe("100 kg");
    expect(formatWeight(100, "lb")).toBe("220.5 lb");
    expect(parseWeight("135", "lb")).toBe(61.23);
    expect(parseWeight("62,5", "kg")).toBe(62.5);
    expect(parseWeight("", "kg")).toBeNull();
    expect(parseWeight("abc", "kg")).toBeNull();
  });
});

describe("distance and pace", () => {
  test("km ↔ mi", () => {
    expect(distanceIn(5, "mi")).toBe(3.11);
    expect(distanceFrom(3.1, "mi")).toBe(4.989);
    expect(distanceIn(distanceFrom(10, "mi"), "mi")).toBe(10);
    expect(formatDistance(5.2, "km")).toBe("5.2 km");
    expect(parseDistance("3.1", "mi")).toBe(4.989);
  });

  test("pace and speed by unit", () => {
    expect(formatPace(406, "km")).toBe("6:46/km");
    expect(formatPace(406, "mi")).toBe("10:53/mi");
    expect(formatSpeed(8.9, "km")).toBe("8.9 km/h");
    expect(formatSpeed(8.9, "mi")).toBe("5.5 mph");
  });
});

describe("displayUnitsOf", () => {
  test("defaults to metric for a missing or malformed preference", () => {
    expect(displayUnitsOf(null)).toEqual({ weight: "kg", distance: "km" });
    expect(displayUnitsOf({ weight: "stone", distance: "km" })).toEqual({ weight: "kg", distance: "km" });
    expect(displayUnitsOf({ weight: "lb", distance: "mi" })).toEqual({ weight: "lb", distance: "mi" });
  });
});
