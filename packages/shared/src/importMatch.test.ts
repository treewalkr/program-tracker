import { describe, expect, test } from "bun:test";
import { editDistance, expandAbbreviations, matchExercise, nameSimilarity, normalizeAlias } from "./importMatch";

const CATALOG = [
  { id: "bench", name: "Bench Press" },
  { id: "squat", name: "Back Squat" },
  { id: "sa-row", name: "Single-Arm Dumbbell Row" },
  { id: "curl", name: "Barbell Biceps Curl" },
  { id: "ovh", name: "Overhead Triceps Extension" },
  { id: "swing", name: "Kettlebell Swing" },
  { id: "lunge", name: "Walking Lunge" },
];

describe("normalization", () => {
  test("alias keys: lowercase, trimmed, punctuation gone, single spaces", () => {
    expect(normalizeAlias("  SA  Row! ")).toBe("sa row");
    expect(normalizeAlias("Lat pull-down")).toBe("lat pull down");
    expect(normalizeAlias("Crossover / Dip")).toBe("crossover dip");
  });

  test("expands gym shorthand word by word", () => {
    expect(expandAbbreviations("BB standing bicpes")).toBe("barbell standing bicpes");
    expect(expandAbbreviations("SA Row")).toBe("single arm row");
    expect(expandAbbreviations("Triceps OVH extension")).toBe("triceps overhead extension");
    expect(expandAbbreviations("Dbl")).toBe("dbl"); // only whole words
  });

  test("edit distance counts a swapped pair once", () => {
    expect(editDistance("bicpes", "biceps")).toBe(1);
    expect(editDistance("row", "rows")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("matchExercise", () => {
  test("alias first, personal over global", () => {
    const aliases = [
      { alias: "sa row", exerciseId: "curl", trainerId: null },
      { alias: "sa row", exerciseId: "sa-row", trainerId: "t1" },
    ];
    expect(matchExercise({ sourceName: "SA Row", name: "Single-Arm Row" }, CATALOG, aliases)).toEqual({
      kind: "alias",
      exerciseId: "sa-row",
      exerciseName: "Single-Arm Dumbbell Row",
    });
    expect(matchExercise({ sourceName: "SA row", name: "x" }, CATALOG, aliases.slice(0, 1)).exerciseId).toBe("curl");
  });

  test("an alias to an exercise outside the catalog is ignored", () => {
    const m = matchExercise({ sourceName: "Bench press", name: "Bench Press" }, CATALOG, [
      { alias: "bench press", exerciseId: "gone", trainerId: "t1" },
    ]);
    expect(m.kind).toBe("exact");
  });

  test("exact catalog name, case-insensitive: expanded name, then as written", () => {
    expect(matchExercise({ sourceName: "Bench press", name: "Bench Press" }, CATALOG)).toEqual({
      kind: "exact",
      exerciseId: "bench",
      exerciseName: "Bench Press",
    });
    expect(matchExercise({ sourceName: "back squat", name: "Squat" }, CATALOG).exerciseId).toBe("squat");
  });

  test("same name up to punctuation and shorthand is exact", () => {
    const catalog = [...CATALOG, { id: "pull", name: "Pull-Up" }, { id: "bbrow", name: "Barbell Row" }];
    expect(matchExercise({ sourceName: "Pull up", name: "Pull Up" }, catalog)).toMatchObject({ kind: "exact", exerciseId: "pull" });
    expect(matchExercise({ sourceName: "BB row", name: "x" }, catalog)).toMatchObject({ kind: "exact", exerciseId: "bbrow" });
  });

  test("fuzzy: shorthand and typos, top candidates offered", () => {
    const sa = matchExercise({ sourceName: "SA Row", name: "Single-Arm Row" }, CATALOG);
    expect(sa).toMatchObject({ kind: "fuzzy", exerciseId: "sa-row" });
    const curl = matchExercise({ sourceName: "BB standing bicpes", name: "Barbell Standing Bicpes" }, CATALOG);
    expect(curl).toMatchObject({ kind: "fuzzy", exerciseId: "curl" });
    expect(curl.candidates!.length).toBeLessThanOrEqual(3);
    expect(curl.candidates![0].score).toBeGreaterThanOrEqual(0.6);
    expect(matchExercise({ sourceName: "Triceps OVH extension", name: "x" }, CATALOG).exerciseId).toBe("ovh");
  });

  test("a shared word alone is not a match", () => {
    const catalog = [{ id: "bench", name: "Bench Press" }];
    expect(matchExercise({ sourceName: "Push press", name: "Push Press" }, catalog).kind).toBe("new");
    expect(matchExercise({ sourceName: "Leg press", name: "Leg Press" }, catalog).kind).toBe("new");
    expect(matchExercise({ sourceName: "Squat", name: "Squat" }, CATALOG)).toMatchObject({ kind: "fuzzy", exerciseId: "squat" });
  });

  test("nothing close → a new exercise named as expanded", () => {
    expect(matchExercise({ sourceName: "Crossover / Dip", name: "Crossover / Dip" }, CATALOG)).toEqual({
      kind: "new",
      exerciseName: "Crossover / Dip",
    });
  });

  test("similarity is symmetric-ish and bounded", () => {
    expect(nameSimilarity("Bench Press", "Bench Press")).toBe(1);
    expect(nameSimilarity("Squat", "Kettlebell Swing")).toBeLessThan(0.6);
  });
});
