import { describe, expect, test } from "bun:test";
import { groupByFormat, searchSessionTypes } from "./sessionTypeSearch";

const types = [
  { name: "Strength", format: "lifting" as const },
  { name: "Mobility", format: "lifting" as const },
  { name: "Intervals", format: "cardio" as const },
  { name: "Zone 2", format: "cardio" as const },
  { name: "Upper strength", format: "lifting" as const },
];

describe("searchSessionTypes", () => {
  test("empty query keeps list order", () => {
    expect(searchSessionTypes(types, "  ").map((t) => t.name)).toEqual(types.map((t) => t.name));
  });
  test("name prefix ranks before a match inside the name", () => {
    expect(searchSessionTypes(types, "str").map((t) => t.name)).toEqual(["Strength", "Upper strength"]);
  });
  test("every word must match; the format label is searchable", () => {
    expect(searchSessionTypes(types, "cardio").map((t) => t.name)).toEqual(["Intervals", "Zone 2"]);
    expect(searchSessionTypes(types, "zone cardio").map((t) => t.name)).toEqual(["Zone 2"]);
    expect(searchSessionTypes(types, "yoga")).toEqual([]);
  });
});

describe("groupByFormat", () => {
  test("lifting first, empty groups dropped", () => {
    expect(groupByFormat(types).map((g) => [g.format, g.items.length])).toEqual([["lifting", 3], ["cardio", 2]]);
    expect(groupByFormat(types.filter((t) => t.format === "cardio")).map((g) => g.format)).toEqual(["cardio"]);
  });
});
