import { describe, expect, test } from "bun:test";
import { sessionTypePath } from "@pt/shared";
import { FORMAT_LABEL, searchSessionTypes } from "./sessionTypeSearch";

const types = [
  { name: "Cardiovascular", format: "cardio" as const, presetKey: "cardiovascular" },
  { name: "Aerobic base", format: "cardio" as const, presetKey: "cardiovascular.aerobic-base" },
  { name: "Strength training", format: "exercises" as const, presetKey: "strength-training" },
  { name: "Stability & mobility", format: "exercises" as const, presetKey: "strength-training.stability-mobility" },
  { name: "Loaded strength", format: "exercises" as const, presetKey: "strength-training.loaded-strength" },
  { name: "Metabolic", format: "any" as const, presetKey: "metabolic" },
  { name: "AMRAP", format: "any" as const, presetKey: "metabolic.amrap" },
  { name: "Upper strength", format: "exercises" as const, presetKey: null },
];
const names = (q: string) => searchSessionTypes(types, q).map((t) => t.name);

describe("searchSessionTypes", () => {
  test("empty query keeps list order", () => {
    expect(names("  ")).toEqual(types.map((t) => t.name));
  });
  test("name prefix ranks before a match inside the name, then a main-type match", () => {
    expect(names("str")).toEqual(["Strength training", "Loaded strength", "Upper strength", "Stability & mobility"]);
  });
  test("a main type's name finds its sub-types, shown as Main › Sub", () => {
    expect(searchSessionTypes(types, "metabolic").map(sessionTypePath)).toEqual(["Metabolic", "Metabolic › AMRAP"]);
    expect(names("cardiovascular aerobic")).toEqual(["Aerobic base"]);
  });
  test("every word must match; the format label is searchable and any-format types fit both", () => {
    expect(names("cardio")).toEqual(["Cardiovascular", "Aerobic base", "AMRAP", "Metabolic"]);
    expect(names("yoga")).toEqual([]);
  });
});

describe("format labels (docs/kind-rename-plan.md)", () => {
  test("trainers read Exercises / Cardio, never Lifting", () => {
    expect(FORMAT_LABEL).toEqual({ exercises: "Exercises", cardio: "Cardio", any: "Exercises or cardio" });
  });
  test("searching the new label finds exercise types", () => {
    expect(names("exercises")).toContain("Upper strength");
    expect(names("lifting")).toEqual([]);
  });
});
