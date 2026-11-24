import { describe, expect, test } from "bun:test";
import {
  FUZZY_AUTO_SCORE,
  FUZZY_MIN_SCORE,
  editDistance,
  expandAbbreviations,
  matchExercise,
  nameMatchParts,
  nameSimilarity,
  legacyNormalizeAlias,
  normalizeAlias,
} from "./importMatch";

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

  test("alias keys keep Thai vowel and tone marks", () => {
    expect(normalizeAlias("วิดพื้น")).toBe("วิดพื้น");
    expect(normalizeAlias("เดดลิฟต์")).toBe("เดดลิฟต์");
    expect(normalizeAlias("ดึ๊ง")).toBe("ดึ๊ง");
    expect(normalizeAlias(" ท่าดึง 1 แขน 🏋️ ")).toBe("ท่าดึง 1 แขน");
  });

  test("alias keys are NFC and drop marks left without a letter (emoji selectors, keycaps)", () => {
    expect(normalizeAlias("Cafe\u0301 row")).toBe("caf\u00e9 row");
    expect(normalizeAlias("1\uFE0F\u20E3 squat 💪🏽")).toBe("1 squat");
    expect(normalizeAlias("🏋️")).toBe("");
  });

  // delete with legacyNormalizeAlias once trainers have re-saved their Thai aliases
  test("the legacy key is the old mark-stripping form stored before 2026-11-24", () => {
    expect(legacyNormalizeAlias("วิดพื้น")).toBe("ว ดพ น");
    expect(legacyNormalizeAlias("เดดลิฟต์")).toBe("เดดล ฟต");
    expect(legacyNormalizeAlias("  SA  Row! ")).toBe("sa row");
  });

  test("expands gym shorthand word by word", () => {
    expect(expandAbbreviations("BB standing bicpes")).toBe("barbell standing bicpes");
    expect(expandAbbreviations("SA Row")).toBe("single arm row");
    expect(expandAbbreviations("Triceps OVH extension")).toBe("triceps overhead extension");
    expect(expandAbbreviations("Dbl")).toBe("dbl"); // only whole words
  });

  test("expands with a given glossary instead of the default", () => {
    const mine = { sa: "single arm", lpd: "lat pulldown" };
    expect(expandAbbreviations("LPD wide", mine)).toBe("lat pulldown wide");
    expect(expandAbbreviations("BB row", mine)).toBe("bb row"); // not in this glossary
    expect(expandAbbreviations("constructor")).toBe("constructor"); // no prototype keys
  });

  test("edit distance counts a swapped pair once", () => {
    expect(editDistance("bicpes", "biceps")).toBe(1);
    expect(editDistance("row", "rows")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("matchExercise", () => {
  test("a Thai alias matches whether it was stored intact or in the legacy mangled form", () => {
    const intact = [{ alias: "วิดพื้น", exerciseId: "bench", trainerId: "t1" }];
    expect(matchExercise({ sourceName: "วิดพื้น", name: "x" }, CATALOG, intact)).toMatchObject({ kind: "alias", exerciseId: "bench" });
    const legacy = [{ alias: "ว ดพ น", exerciseId: "curl", trainerId: "t1" }];
    expect(matchExercise({ sourceName: "วิดพื้น", name: "x" }, CATALOG, legacy)).toMatchObject({ kind: "alias", exerciseId: "curl" });
    // an intact alias wins over a legacy one for the same words
    expect(matchExercise({ sourceName: "วิดพื้น", name: "x" }, CATALOG, [...legacy, ...intact])).toMatchObject({ exerciseId: "bench" });
    const globalLegacy = [{ alias: "ว ดพ น", exerciseId: "curl", trainerId: null }];
    expect(matchExercise({ sourceName: "วิดพื้น", name: "x" }, CATALOG, globalLegacy)).toMatchObject({ kind: "alias", exerciseId: "curl" });
  });

  test("a personal alias comes first and beats a global one", () => {
    const aliases = [
      { alias: "sa row", exerciseId: "curl", trainerId: null },
      { alias: "sa row", exerciseId: "sa-row", trainerId: "t1" },
    ];
    expect(matchExercise({ sourceName: "SA Row", name: "Single-Arm Row" }, CATALOG, aliases)).toEqual({
      kind: "alias",
      exerciseId: "sa-row",
      exerciseName: "Single-Arm Dumbbell Row",
    });
    // a personal alias even beats an exact catalog name
    expect(
      matchExercise({ sourceName: "Bench Press", name: "Bench Press" }, CATALOG, [{ alias: "bench press", exerciseId: "curl", trainerId: "t1" }]),
    ).toMatchObject({ kind: "alias", exerciseId: "curl" });
  });

  test("a global alias beats fuzzy but loses to an exact catalog name", () => {
    const global = [{ alias: "sa row", exerciseId: "curl", trainerId: null }];
    expect(matchExercise({ sourceName: "SA row", name: "x" }, CATALOG, global)).toMatchObject({ kind: "alias", exerciseId: "curl" });
    // without the alias the same name is only a fuzzy match
    expect(matchExercise({ sourceName: "SA row", name: "x" }, CATALOG).kind).toBe("fuzzy");
    // the trainer's own "Bench Press" wins over a seed alias of the same words
    const seed = [{ alias: "bench press", exerciseId: "curl", trainerId: null }];
    expect(matchExercise({ sourceName: "Bench press", name: "Bench Press" }, CATALOG, seed)).toMatchObject({ kind: "exact", exerciseId: "bench" });
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
    expect(sa).toMatchObject({ kind: "fuzzy", exerciseName: "Single-Arm Row" });
    expect(sa.candidates![0]).toMatchObject({ exerciseId: "sa-row" });
    const curl = matchExercise({ sourceName: "BB standing bicpes", name: "Barbell Standing Bicpes" }, CATALOG);
    expect(curl.kind).toBe("fuzzy");
    expect(curl.candidates![0].exerciseId).toBe("curl");
    expect(curl.candidates!.length).toBeLessThanOrEqual(3);
    expect(curl.candidates![0].score).toBeGreaterThanOrEqual(FUZZY_MIN_SCORE);
  });

  test("fuzzy: picked only when strong and every written word is covered", () => {
    expect(matchExercise({ sourceName: "Triceps OVH extension", name: "x" }, CATALOG)).toMatchObject({ kind: "fuzzy", exerciseId: "ovh" });
    const catalog = [...CATALOG, { id: "rdl", name: "Romanian Deadlifts" }];
    const rdl = matchExercise({ sourceName: "Romanian deadlift", name: "Romanian deadlift" }, catalog);
    expect(rdl).toMatchObject({ kind: "fuzzy", exerciseId: "rdl", exerciseName: "Romanian Deadlifts" });
    expect(rdl.candidates![0].score).toBeGreaterThanOrEqual(FUZZY_AUTO_SCORE);
  });

  test("fuzzy: a weak match is only suggested", () => {
    const catalog = [...CATALOG, { id: "hop", name: "Single-Leg Hop" }, { id: "pull", name: "Pull-Up" }];
    const m = matchExercise({ sourceName: "Single leg throwball", name: "Single Leg Throwball" }, catalog);
    expect(m.kind).toBe("fuzzy");
    expect(m.exerciseId).toBeUndefined();
    expect(m.exerciseName).toBe("Single Leg Throwball");
    expect(m.candidates!.map((c) => c.exerciseId)).toContain("hop");
    // exact names are untouched
    expect(matchExercise({ sourceName: "Pull up", name: "Pull Up" }, catalog)).toMatchObject({ kind: "exact", exerciseId: "pull" });
  });

  test("a shared word alone is not a match", () => {
    const catalog = [{ id: "bench", name: "Bench Press" }];
    expect(matchExercise({ sourceName: "Push press", name: "Push Press" }, catalog).kind).toBe("new");
    expect(matchExercise({ sourceName: "Leg press", name: "Leg Press" }, catalog).kind).toBe("new");
    const squat = matchExercise({ sourceName: "Squat", name: "Squat" }, CATALOG);
    expect(squat).toMatchObject({ kind: "fuzzy", exerciseName: "Squat" });
    expect(squat.exerciseId).toBeUndefined();
    expect(squat.candidates![0].exerciseId).toBe("squat");
  });

  test("matching uses the trainer's glossary", () => {
    const catalog = [{ id: "lpd", name: "Lat Pulldown" }];
    expect(matchExercise({ sourceName: "LPD", name: "LPD" }, catalog).kind).toBe("new");
    expect(matchExercise({ sourceName: "LPD", name: "LPD" }, catalog, [], { lpd: "lat pulldown" })).toMatchObject({
      kind: "exact",
      exerciseId: "lpd",
    });
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
    expect(nameMatchParts("Single leg throwball", "Single-Leg Hop")!.coverage).toBeCloseTo(2 / 3);
    expect(nameMatchParts("", "Hop")).toBeNull();
  });
});
