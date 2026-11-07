import { describe, expect, test } from "bun:test";
import {
  Equipment,
  FunctionalMovement,
  MovementPattern,
  MuscleGroup,
  type FunctionalMovement as FM,
  type MovementPattern as MP,
  type MuscleGroup as MG,
} from "@pt/shared";
import { ALIASES, type LibraryEntry } from "./curation";
import { readFileSync } from "node:fs";
import { toSeedSql } from "./build";
import lib from "./exercise-library.json";

const library = lib as LibraryEntry[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Primary muscles that can plausibly drive each pattern. */
const PRIMARY_FOR: Record<MP, MG[]> = {
  horizontal_push: ["chest", "triceps", "shoulders"],
  vertical_push: ["shoulders", "triceps", "chest"],
  horizontal_pull: ["back", "shoulders", "traps", "biceps"],
  vertical_pull: ["back", "shoulders", "traps", "biceps"],
  knee_dominant: ["quads", "glutes"],
  hip_dominant: ["hamstrings", "glutes", "back", "full_body"],
  rotation: ["core"],
  anti_rotation: ["core"],
  lateral_flexion: ["core"],
  anti_lateral_flexion: ["core"],
  trunk_flexion: ["core"],
  anti_trunk_flexion: ["core"],
};

/** Functional movements that fit each pattern (null = untagged is fine). */
const FUNCTIONAL_FOR: Record<MP, (FM | null)[]> = {
  horizontal_push: ["push", "locomotion"],
  vertical_push: ["push"],
  horizontal_pull: ["pull", "locomotion"],
  vertical_pull: ["pull"],
  knee_dominant: ["squat", "single_leg", "locomotion"],
  hip_dominant: ["bend_lift", "single_leg"],
  rotation: ["rotation"],
  anti_rotation: ["rotation", null],
  lateral_flexion: [null],
  anti_lateral_flexion: [null, "locomotion"],
  trunk_flexion: [null],
  anti_trunk_flexion: [null],
};

/** German words that leaked into the old WGER seed. */
const GERMAN = /\b(und|mit|auf|der|die|das|kniebeuge|bankdr|beinstrecker|beckenheben|langhantel|kurzhantel|übung|ubung|seitheben|rudern|klimmzug)\b/i;

describe("exercise library", () => {
  test("is a substantial library", () => {
    expect(library.length).toBeGreaterThan(500);
  });

  test("every entry matches the app's vocabulary", () => {
    for (const e of library) {
      expect(e.name.trim()).toBe(e.name);
      expect(MuscleGroup.safeParse(e.primaryMuscleGroup).success).toBe(true);
      for (const m of e.secondaryMuscleGroups) expect(MuscleGroup.safeParse(m).success).toBe(true);
      expect(e.secondaryMuscleGroups).not.toContain(e.primaryMuscleGroup);
      expect(new Set(e.secondaryMuscleGroups).size).toBe(e.secondaryMuscleGroups.length);
      expect(e.secondaryMuscleGroups.length).toBeLessThanOrEqual(4);
      expect(Equipment.safeParse(e.equipment).success).toBe(true);
      if (e.movementPattern) expect(MovementPattern.safeParse(e.movementPattern).success).toBe(true);
      if (e.functionalMovement) expect(FunctionalMovement.safeParse(e.functionalMovement).success).toBe(true);
    }
  });

  test("names are unique, even ignoring case and punctuation", () => {
    const seen = new Map<string, string>();
    const dupes = library.filter((e) => {
      const k = norm(e.name);
      if (seen.has(k)) return true;
      seen.set(k, e.name);
      return false;
    });
    expect(dupes.map((e) => e.name)).toEqual([]);
  });

  test("names are plain English: ASCII, no German, no source-style suffixes", () => {
    const bad = library.filter(
      (e) => /[^\x20-\x7E]/.test(e.name) || GERMAN.test(e.name) || / - |\(v\d\)|\s{2}/.test(e.name)
    );
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  test("tagged patterns have a primary muscle that can drive them", () => {
    const bad = library.filter((e) => e.movementPattern && !PRIMARY_FOR[e.movementPattern].includes(e.primaryMuscleGroup));
    expect(bad.map((e) => `${e.name}: ${e.movementPattern} / ${e.primaryMuscleGroup}`)).toEqual([]);
  });

  test("functional movement agrees with the pattern", () => {
    const bad = library.filter((e) => e.movementPattern && !FUNCTIONAL_FOR[e.movementPattern].includes(e.functionalMovement));
    expect(bad.map((e) => `${e.name}: ${e.movementPattern} / ${e.functionalMovement}`)).toEqual([]);
  });

  test("spot checks of well-known lifts", () => {
    const by = new Map(library.map((e) => [e.name, e]));
    const pick = (n: string) => {
      const e = by.get(n);
      if (!e) throw new Error(`missing ${n}`);
      return [e.primaryMuscleGroup, e.equipment, e.movementPattern, e.functionalMovement];
    };
    expect(pick("Barbell Back Squat")).toEqual(["quads", "barbell", "knee_dominant", "squat"]);
    expect(pick("Barbell Bench Press")).toEqual(["chest", "barbell", "horizontal_push", "push"]);
    expect(pick("Barbell Deadlift")).toEqual(["back", "barbell", "hip_dominant", "bend_lift"]);
    expect(pick("Pull-Up")).toEqual(["back", "bodyweight", "vertical_pull", "pull"]);
    expect(pick("Barbell Overhead Press")).toEqual(["shoulders", "barbell", "vertical_push", "push"]);
    expect(pick("Seated Cable Row")).toEqual(["back", "cable", "horizontal_pull", "pull"]);
    expect(pick("Bulgarian Split Squat")).toEqual(["quads", "bodyweight", "knee_dominant", "single_leg"]);
    expect(pick("Pallof Press")).toEqual(["core", "cable", "anti_rotation", "rotation"]);
    expect(pick("Plank")).toEqual(["core", "bodyweight", "anti_trunk_flexion", null]);
    expect(pick("Farmer's Carry")).toEqual(["forearms", "other", null, "locomotion"]);
    expect(pick("Trap Bar Deadlift")).toEqual(["glutes", "barbell", "hip_dominant", "bend_lift"]);
    expect(pick("Power Clean")).toEqual(["full_body", "barbell", "hip_dominant", "bend_lift"]);
  });

  test("every alias points at a library exercise", () => {
    const names = new Set(library.map((e) => e.name));
    expect(Object.values(ALIASES).filter((n) => !names.has(n))).toEqual([]);
  });

  test("seed/exercises.sql is regenerated from the library", () => {
    const sql = readFileSync(new URL("../seed/exercises.sql", import.meta.url), "utf8");
    expect(sql).toBe(toSeedSql(library));
  });
});
