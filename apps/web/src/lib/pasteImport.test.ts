import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildImportResult,
  chunkLines,
  historyExerciseKey,
  importLines,
  matchExercise,
  mockImportExtraction,
  type ImportResult,
} from "@pt/shared";
import {
  abPickError,
  abWeekOptions,
  aliasesToSave,
  blockLabel,
  choiceFor,
  draftWeekIndexes,
  defaultAbPick,
  defaultChoice,
  flagSummary,
  formFromImport,
  hasTraining,
  historyAliasesToSave,
  historyExerciseIds,
  historyExerciseMap,
  historyNewExerciseNames,
  historyWeeks,
  itemsByLine,
  lineOfItem,
  lineStates,
  newExerciseNames,
  setsLabel,
  templateExercises,
  type ChoiceState,
  type MatchChoice,
} from "./pasteImport";
import type { DraftForm } from "./programForm";

const FIXTURE = readFileSync(new URL("../../../../packages/shared/fixtures/import/week11-12.txt", import.meta.url), "utf8");
const LINES = importLines(FIXTURE);
const CATALOG = [
  { id: "bench", name: "Bench Press" },
  { id: "squat", name: "Back Squat" },
  { id: "db-bench", name: "Dumbbell Bench Press" },
];

function result(): ImportResult {
  const r = buildImportResult(
    FIXTURE,
    chunkLines(LINES).map((c) => ({ ...c, ok: true as const, data: mockImportExtraction(LINES, c.from, c.to) })),
  );
  for (const w of r.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) e.match = matchExercise(e, CATALOG);
  return r;
}

const BASE: DraftForm = {
  name: "",
  description: "",
  plannedWeeks: 4,
  phase: "accumulation",
  nextPhase: "deload",
  usePhasing: true,
  schemeMode: "none",
  selectedSchemeId: "",
  customWeeks: [],
  schemeName: "",
  sessions: [],
};

let n = 0;
const newKey = () => `k${++n}`;
const resolve = (c: MatchChoice) =>
  c.kind === "catalog" ? { exerciseId: c.exerciseId, exerciseName: c.exerciseName } : { exerciseId: `new:${c.exerciseName}`, exerciseName: c.exerciseName };

describe("hasTraining", () => {
  test("a read with no sessions has nothing to review", () => {
    const empty = buildImportResult("You read a trainer's notes\nRespond with JSON", [
      { from: 1, to: 2, ok: true, data: { weeks: [], skipped: [{ line: 1, reason: "not training" }, { line: 2, reason: "not training" }] } },
    ]);
    expect(hasTraining(empty)).toBe(false);
    const daysOnly = buildImportResult("Day 1", [
      { from: 1, to: 1, ok: true, data: { weeks: [{ label: null, line: null, days: [{ label: "Day 1", line: 1, sessions: [] }] }], skipped: [] } },
    ]);
    expect(hasTraining(daysOnly)).toBe(false);
  });

  test("the fixture has training", () => {
    const r = buildImportResult(FIXTURE, chunkLines(LINES).map((c) => ({ ...c, ok: true as const, data: mockImportExtraction(LINES, c.from, c.to) })));
    expect(hasTraining(r)).toBe(true);
  });
});

describe("blocks", () => {
  test("labels each block with its weeks and the template week's exercise days", () => {
    const r = result();
    expect(blockLabel(r, 0)).toBe("Week 11 (Back/Biceps · Chest/Triceps · Lower)");
    expect(blockLabel(r, 1)).toBe("Week 12 (Upper Push · Upper Pull · Lower)");
  });
});

describe("formFromImport", () => {
  test("a warm-up section lands in movement prep, listed first", () => {
    const text = ["Day 1 Lower", "Back squat 4x6", "Warm-up", "Hip CARs 2x5"].join("\n");
    const ex = (line: number, name: string) => ({ line, sourceName: name, name, prescription: { sets: 2, reps: 5 } });
    const r = buildImportResult(text, [{ from: 1, to: 4, ok: true, data: {
      weeks: [{ label: null, line: null, days: [{ label: "Day 1 Lower", line: 1, sessions: [{ name: "Lower", kind: "exercises", line: 1, exercises: [ex(2, "Back squat"), ex(4, "Hip CARs")] }] }] }],
      skipped: [{ line: 3, reason: "section heading" }],
    } }]);
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey });
    expect(form.sessions[0].exercises.map((e) => [e.exerciseId, e.block ?? "main", e.order])).toEqual([
      ["new:Hip CARs", "prep", 0],
      ["new:Back squat", "main", 1],
    ]);
  });

  test("drafts the default block (Week 12) as the form", () => {
    const r = result();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey });
    expect(form.name).toBe("Upper Push / Upper Pull / Lower");
    expect(form.plannedWeeks).toBe(4); // one week in the block → default kept
    expect(form.phase).toBe("accumulation");
    expect(form.sessions.map((s) => [s.name, s.kind, s.exercises.length])).toEqual([
      ["Upper Push", "exercises", 6],
      ["Upper Pull", "exercises", 6],
      ["Lower", "exercises", 5],
    ]);
    const dbBench = form.sessions[0].exercises[1];
    expect(dbBench).toMatchObject({ exerciseId: "db-bench", exerciseName: "Dumbbell Bench Press", order: 1 });
    expect(dbBench.prescribedSets.map((s) => [s.reps, s.repsMin])).toEqual([[8, 6], [8, 6], [8, 6], [8, 6]]);
    expect(form.sessions[0].exercises[2].notes).toBe("Kinesis");
    expect(form.sessions[0].exercises[3]).toMatchObject({ exerciseId: "new:Crossover / Dip" });
  });

  test("every imported exercise gets a suggested role, in the notes' order", () => {
    const r = result();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey });
    for (const s of form.sessions.filter((s) => s.kind === "exercises")) {
      expect(s.exercises.every((e) => !!e.role)).toBe(true);
      expect(s.exercises.map((e) => e.order)).toEqual(s.exercises.map((_, i) => i));
    }
    expect(form.sessions.flatMap((s) => s.exercises.map((e) => `${e.exerciseName}: ${e.role}`))).toMatchSnapshot();
  });

  test("catalog patterns steer the suggestion", () => {
    const r = result();
    const catalog = [{ id: "bench", name: "Bench Press", primaryMuscleGroup: "core", equipment: "barbell", movementPatterns: ["anti_extension"] }];
    // "Incline bench press" is only a suggestion for Bench Press: the trainer takes it
    const incline = templateExercises(r, r.defaultBlock).find(({ ex }) => ex.sourceName === "Incline bench press")!.key;
    const choices: Record<string, ChoiceState> = { [incline]: { choice: { kind: "catalog", exerciseId: "bench", exerciseName: "Bench Press" }, confirmed: true } };
    const form = formFromImport(r, r.defaultBlock, BASE, { choices, resolve, newKey, catalog });
    const bench = form.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === "bench");
    expect(bench?.role).toBe("core");
  });

  test("Week 11 keeps its cardio sessions, with the wording in intensity", () => {
    const r = result();
    const form = formFromImport(r, 0, BASE, { choices: {}, resolve, newKey });
    expect(form.sessions.map((s) => s.kind)).toEqual(["exercises", "cardio", "exercises", "cardio", "exercises"]);
    expect(form.sessions[1].cardio).toMatchObject({ modality: "Cardio", durationMin: 60, hrZone: 3, intensity: "Zone 2–3 · 40–60 min" });
  });

  test("a multi-week block sets plannedWeeks and drafts its latest week", () => {
    const r = result();
    r.blocks = [{ weeks: [0, 1] }];
    const form = formFromImport(r, 0, BASE, { choices: {}, resolve, newKey });
    expect(form.plannedWeeks).toBe(2);
    expect(form.sessions[0].name).toBe("Upper Push");
  });

  test("the trainer's choice wins over the match", () => {
    const r = result();
    const key = templateExercises(r, 1).find(({ ex }) => ex.line === 56)!.key;
    const choices: Record<string, ChoiceState> = { [key]: { choice: { kind: "new", exerciseName: "Squat" }, confirmed: true } };
    const form = formFromImport(r, 1, BASE, { choices, resolve, newKey });
    expect(form.sessions[2].exercises[0].exerciseId).toBe("new:Squat");
  });
});

describe("A/B weeks found (FB-013)", () => {
  const AB = { a: 0, b: 1, source: "notes" as const };

  test("kept: Week 11 fills Week A, Week 12 fills Week B", () => {
    const r = result();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey, ab: AB });
    expect(form.sessions.map((s) => s.kind)).toEqual(["exercises", "cardio", "exercises", "cardio", "exercises"]);
    expect(form.weekB?.map((s) => s.name)).toEqual(["Upper Push", "Upper Pull", "Lower"]);
    expect(form.plannedWeeks).toBe(4);
  });

  test("declined: one template week, and no Week B left over from the form", () => {
    const r = result();
    const form = formFromImport(r, r.defaultBlock, { ...BASE, weekB: [] }, { choices: {}, resolve, newKey });
    expect(form.weekB).toBeNull();
    expect(draftWeekIndexes(r, r.defaultBlock)).toEqual([1]);
  });

  test("both weeks' exercises are resolved, created and checked", () => {
    const r = result();
    expect(draftWeekIndexes(r, r.defaultBlock, AB)).toEqual([0, 1]);
    const both = templateExercises(r, r.defaultBlock, AB);
    expect(both.length).toBeGreaterThan(templateExercises(r, r.defaultBlock).length);
    expect(both.some(({ key }) => key.startsWith("w0"))).toBe(true);
    expect(newExerciseNames(r, r.defaultBlock, {}, AB).length).toBeGreaterThanOrEqual(newExerciseNames(r, r.defaultBlock, {}).length);
    const one = flagSummary(r, r.defaultBlock, {});
    const two = flagSummary(r, r.defaultBlock, {}, AB);
    expect(two.amber).toBeGreaterThanOrEqual(one.amber);
  });
});

describe("A/B week pick helpers (FB-015)", () => {
  /** A result of weeks: "lift", "cardio" or "empty" (a header with no sessions). */
  const weeks = (...kinds: ("lift" | "cardio" | "empty")[]): ImportResult => ({
    lineCount: 0,
    weeks: kinds.map((k, i) => ({
      label: `Week ${i + 1}`,
      line: null,
      flags: [],
      days:
        k === "empty"
          ? []
          : [
              {
                label: "Day 1",
                line: 1,
                flags: [],
                sessions: [{ name: k, kind: k === "lift" ? "exercises" : "cardio", line: 1, source: null, cardio: null, exercises: [], flags: [] }],
              },
            ],
    })),
    skipped: [],
    unused: [],
    unread: [],
    blocks: kinds.map((_, i) => ({ weeks: [i] })),
    defaultBlock: Math.max(0, kinds.length - 1),
    alternating: false,
  });

  test("options: weeks with a session, in order; an empty week is skipped, a cardio-only week counts", () => {
    expect(abWeekOptions(weeks("empty", "lift", "lift"))).toEqual([1, 2]);
    expect(abWeekOptions(weeks("lift", "cardio", "empty", "lift"))).toEqual([0, 1, 3]);
    expect(abWeekOptions(weeks("empty", "empty"))).toEqual([]);
    expect(abWeekOptions(weeks("lift"))).toEqual([0]);
    expect(abWeekOptions(weeks("lift", "empty"))).toEqual([0]);
  });

  test("default pick: the first two weeks with training, or none", () => {
    expect(defaultAbPick(weeks("empty", "lift", "lift"))).toEqual({ a: 1, b: 2, source: "picked" });
    expect(defaultAbPick(weeks("lift", "lift"))).toEqual({ a: 0, b: 1, source: "picked" });
    expect(defaultAbPick(weeks("lift"))).toBeNull();
    expect(defaultAbPick(weeks("empty", "lift"))).toBeNull();
    expect(defaultAbPick(weeks())).toBeNull();
  });

  test("a pick needs two different weeks", () => {
    expect(abPickError({ a: 1, b: 1 })).toBe("Pick two different weeks for A and B.");
    expect(abPickError({ a: 1, b: 2 })).toBeNull();
    expect(abPickError({ a: 2, b: 1 })).toBeNull();
    expect(abPickError(null)).toBeNull();
  });
});

describe("FB-015 picked A/B", () => {
  const TEXT = readFileSync(new URL("../../../../packages/shared/fixtures/import/fb-015-ab.txt", import.meta.url), "utf8");
  const L = importLines(TEXT);
  /** The real chunk outputs, through the pipeline, matched against a small catalog. */
  function fb015(): ImportResult {
    const r = buildImportResult(TEXT, chunkLines(L).map((c) => ({ ...c, ok: true as const, data: mockImportExtraction(L, c.from, c.to) })));
    for (const w of r.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) e.match = matchExercise(e, CATALOG);
    return r;
  }
  const names = (rows: { exercises: { exerciseName: string; group?: string }[] }[] | null | undefined) =>
    (rows ?? []).map((s) => s.exercises.map((e) => `${e.group ? `${e.group}:` : ""}${e.exerciseName}`));

  test("reads as stored in prod: an empty week, Week 1, Week 2 — three blocks, no A/B found", () => {
    const r = fb015();
    expect(r.weeks.map((w) => w.label)).toEqual([null, "Week 1 (คี่)", "Week 2 (คู่)"]);
    expect(r.blocks).toEqual([{ weeks: [0] }, { weeks: [1] }, { weeks: [2] }]);
    expect(r.ab).toBeNull();
    expect(abWeekOptions(r)).toEqual([1, 2]);
    expect(defaultAbPick(r)).toEqual({ a: 1, b: 2, source: "picked" });
  });

  test("the default pick drafts Week 1 as Week A and Week 2 as Week B, in order, supersets kept", () => {
    const r = fb015();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey, ab: defaultAbPick(r) });
    expect(form.sessions.map((s) => s.name)).toEqual(["Push", "Pull"]);
    expect(form.weekB?.map((s) => s.name)).toEqual(["squat+vertical", "Deadlift + Horizontal"]);
    expect(names(form.sessions)).toEqual([
      ["Burpee to Throwball", "Sled push", "A:Squat", "A:Farmer carry", "Reverse Lunge", "Bench Press"],
      ["Power snatch", "Sled Pull", "Deadlift", "V bar row", "Lat pull down", "Face pull"],
    ]);
    expect(names(form.weekB)).toEqual([
      ["A:Wallball", "A:Plank shoulder tap", "B:Sling Walk", "B:SkiERG", "Squat", "C:Shoulder press", "C:Lat pull down"],
      ["A:Single leg throwball", "A:Slamball side to side", "B:RowERG", "B:Russian Twist", "Deadlift", "C:Bench Press", "C:Bent over row"],
    ]);
    for (const s of [...form.sessions, ...(form.weekB ?? [])]) expect(s.exercises.map((e) => e.order)).toEqual(s.exercises.map((_, i) => i));
    expect(form.plannedWeeks).toBe(BASE.plannedWeeks);
    expect(form.name).toBe("Push / Pull");
  });

  test("swapped (A = Week 2, B = Week 1): the routines swap", () => {
    const r = fb015();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey, ab: { a: 2, b: 1, source: "picked" } });
    expect(form.sessions.map((s) => s.name)).toEqual(["squat+vertical", "Deadlift + Horizontal"]);
    expect(form.weekB?.map((s) => s.name)).toEqual(["Push", "Pull"]);
  });

  test("both weeks' exercises are created, aliased and checked — never the empty week", () => {
    const r = fb015();
    const ab = defaultAbPick(r);
    const all = templateExercises(r, r.defaultBlock, ab);
    expect(all).toHaveLength(26);
    expect(all.filter(({ key }) => key.startsWith("w1"))).toHaveLength(12);
    expect(all.filter(({ key }) => key.startsWith("w2"))).toHaveLength(14);
    expect(all.some(({ key }) => key.startsWith("w0"))).toBe(false);

    const fresh = newExerciseNames(r, r.defaultBlock, {}, ab);
    expect(fresh).toContain("Burpee to Throwball"); // Week A only
    expect(fresh).toContain("Wallball"); // Week B only
    expect(fresh).not.toContain("Bench Press"); // in the catalog
    expect(new Set(fresh.map((x) => x.toLowerCase())).size).toBe(fresh.length);
    expect(fresh.length).toBeGreaterThan(newExerciseNames(r, r.defaultBlock, {}).length);

    const pushKey = all.find(({ ex }) => ex.sourceName === "Burpee to Throwball")!.key;
    const wallKey = all.find(({ ex }) => ex.sourceName === "Wallball")!.key;
    const choices: Record<string, ChoiceState> = {
      [pushKey]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true },
      [wallKey]: { choice: { kind: "catalog", exerciseId: "bench", exerciseName: "Bench Press" }, confirmed: true },
    };
    expect(aliasesToSave(r, r.defaultBlock, choices, new Map(), ab).map((a) => a.alias)).toEqual(["Burpee to Throwball", "Wallball"]);
    expect(aliasesToSave(r, r.defaultBlock, choices).map((a) => a.alias)).toEqual(["Wallball"]);

    const both = flagSummary(r, r.defaultBlock, {}, ab);
    const weekA = flagSummary(r, 1, {});
    const weekB = flagSummary(r, 2, {});
    expect(both.amber).toBe(weekA.amber + weekB.amber);
    expect(both.info).toBe(weekA.info + weekB.info);
    expect(both.blocking).toEqual([]);
  });

  test("no pick: the latest block as today, no Week B", () => {
    const r = fb015();
    const form = formFromImport(r, r.defaultBlock, { ...BASE, weekB: [] }, { choices: {}, resolve, newKey });
    expect(form.sessions.map((s) => s.name)).toEqual(["squat+vertical", "Deadlift + Horizontal"]);
    expect(form.weekB).toBeNull();
    expect(draftWeekIndexes(r, r.defaultBlock)).toEqual([2]);
  });

  test("week11-12 grouped into one block still offers A/B weeks", () => {
    const r = result();
    r.blocks = [{ weeks: [0, 1] }];
    r.defaultBlock = 0;
    expect(abWeekOptions(r)).toEqual([0, 1]);
    const form = formFromImport(r, 0, BASE, { choices: {}, resolve, newKey, ab: defaultAbPick(r) });
    expect(form.sessions.filter((s) => s.kind === "exercises").map((s) => s.name)).toEqual(["Back/Biceps", "Chest/Triceps", "Lower"]);
    expect(form.weekB?.map((s) => s.name)).toEqual(["Upper Push", "Upper Pull", "Lower"]);
    expect(form.plannedWeeks).toBe(BASE.plannedWeeks);
  });
});

describe("matches", () => {
  test("default choice follows the match", () => {
    expect(defaultChoice({ kind: "fuzzy", exerciseId: "x", exerciseName: "X" }, "y")).toEqual({ kind: "catalog", exerciseId: "x", exerciseName: "X" });
    // a weak fuzzy match only suggests: it stays new until the trainer picks
    const weak = { kind: "fuzzy" as const, exerciseName: "Single Leg Throwball", candidates: [{ exerciseId: "hop", name: "Single-Leg Hop", score: 0.66 }] };
    expect(defaultChoice(weak, "y")).toEqual({ kind: "new", exerciseName: "Single Leg Throwball" });
    expect(defaultChoice({ kind: "new", exerciseName: "Dip" }, "y")).toEqual({ kind: "new", exerciseName: "Dip" });
    expect(defaultChoice(undefined, "Row")).toEqual({ kind: "new", exerciseName: "Row" });
  });

  test("new exercise names are unique and come from current choices", () => {
    const r = result();
    const names = newExerciseNames(r, 1, {});
    expect(names).toContain("Crossover / Dip");
    expect(names).not.toContain("Dumbbell Bench Press");
    expect(new Set(names.map((s) => s.toLowerCase())).size).toBe(names.length);
  });

  test("only the trainer's picks become aliases, keyed by the name as written", () => {
    const r = result();
    const items = templateExercises(r, 1);
    const squat = items.find(({ ex }) => ex.line === 56)!;
    const dip = items.find(({ ex }) => ex.line === 43)!;
    const choices: Record<string, ChoiceState> = {
      [squat.key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true },
      [dip.key]: { choice: { kind: "new", exerciseName: "Crossover / Dip" }, confirmed: true },
    };
    expect(aliasesToSave(r, 1, choices, new Map([["crossover / dip", "dip-id"]]))).toEqual([
      { alias: "Crossover / Dip", exerciseId: "dip-id", source: "import" },
      { alias: "Squat", exerciseId: "squat", source: "import" },
    ]);
    // untouched: nothing is saved
    expect(aliasesToSave(r, 1, {})).toEqual([]);
    // changed to a new exercise that wasn't created → nothing to point at
    expect(aliasesToSave(r, 1, { [squat.key]: { choice: { kind: "new", exerciseName: "Squat" }, confirmed: true } })).toEqual([]);
  });

  test("an unconfirmed fuzzy match is never saved, even a strong one picked for the trainer", () => {
    const r = result();
    const squat = templateExercises(r, 1).find(({ ex }) => ex.line === 56)!;
    squat.ex.match = { kind: "fuzzy", exerciseId: "squat", exerciseName: "Back Squat", candidates: [] };
    expect(choiceFor({}, squat.key, squat.ex)).toMatchObject({ kind: "catalog", exerciseId: "squat" });
    expect(aliasesToSave(r, 1, {})).toEqual([]);
    // unconfirmed state (not picked by the trainer) isn't saved either
    expect(aliasesToSave(r, 1, { [squat.key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: false } })).toEqual([]);
    expect(
      aliasesToSave(r, 1, { [squat.key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true } }),
    ).toEqual([{ alias: "Squat", exerciseId: "squat", source: "import" }]);
  });
});

describe("flags and lines", () => {
  test("summarizes the block: amber, info, matches accepted, nothing blocking", () => {
    const r = result();
    const s = flagSummary(r, 0);
    expect(s.amber).toBe(0); // Lateral Stretch has no numbers — fine for a stretch
    expect(s.info).toBeGreaterThan(0);
    expect(s.blocking).toEqual([]);
    expect(s.unused).toBe(0);
    const w12 = flagSummary(r, 1);
    // Incline bench press and Squat are only suggestions, so nothing was matched for the trainer
    expect(w12.matched).toBe(0);
    const strong = result();
    const squat = templateExercises(strong, 1).find(({ ex }) => ex.line === 56)!;
    squat.ex.match = { kind: "fuzzy", exerciseId: "squat", exerciseName: "Back Squat", candidates: [] };
    expect(flagSummary(strong, 1).matched).toBe(1);
    expect(flagSummary(strong, 1, { [squat.key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true } }).matched).toBe(0);
  });

  test("maps lines to items and back", () => {
    const r = result();
    const byLine = itemsByLine(r);
    expect(byLine.get(1)).toEqual(["w0"]);
    expect(byLine.get(3)).toEqual(["w0d0", "w0d0s0"]);
    expect(byLine.get(56)).toEqual(["w1d2s0e0"]);
    expect(lineOfItem(r).get("w1d2s0e0")).toBe(56);
  });

  test("line states: blank separators, amber, info, unused, unread", () => {
    const r = result();
    const states = lineStates(r, LINES);
    expect(states[1]).toBe("blank");
    expect(states[13]).toBe("blank"); // ————
    expect(states[3]).toBe("used"); // a stretch with no numbers is fine
    expect(states[4]).toBe("info"); // 1-2 sets
    expect(states[6]).toBe("used");
    r.unused = [7];
    r.unread = [{ from: 37, to: 61, error: "x" }];
    const after = lineStates(r, LINES);
    expect(after[6]).toBe("unused");
    expect(after[39]).toBe("unread");
  });

  test("set labels read like the editor", () => {
    const r = result();
    const at = (line: number) => setsLabel(templateExercises(r, line < 37 ? 0 : 1).find(({ ex }) => ex.line === line)!.ex.sets);
    expect(at(41)).toBe("4 × 6–8");
    expect(at(44)).toBe("3 × AMRAP");
    expect(at(9)).toBe("10/8/6/5");
    expect(at(16)).toBe("2 × 15s");
  });
});

describe("history import helpers", () => {
  test("history weeks are the blocks with logged numbers", () => {
    expect(historyWeeks(result())).toEqual([0, 1]);
    const r = result();
    for (const d of r.weeks[0].days) for (const s of d.sessions) for (const e of s.exercises) e.actuals = null;
    expect(historyWeeks(r)).toEqual([1]);
  });

  test("each name: the review's pick, else the match, else a new custom exercise", () => {
    const r = result();
    // "Bench press" (week 11, exact) and "Squat" (week 12 template, fuzzy)
    const squatKey = templateExercises(r, 1).find(({ ex }) => ex.sourceName === "Squat")!.key;
    const choices: Record<string, ChoiceState> = {
      [squatKey]: { choice: { kind: "catalog", exerciseId: "db-bench", exerciseName: "Dumbbell Bench Press" }, confirmed: true },
    };
    const map = historyExerciseMap(r, choices);
    expect(map.get(historyExerciseKey("Bench press"))).toEqual({
      choice: { kind: "catalog", exerciseId: "bench", exerciseName: "Bench Press" },
      alias: false,
      sourceName: "Bench press",
    });
    expect(map.get(historyExerciseKey("Squat"))).toMatchObject({ choice: { exerciseId: "db-bench" }, alias: true });
    expect(map.get(historyExerciseKey("SA Row"))).toMatchObject({ choice: { kind: "new", exerciseName: "Single-Arm Row" }, alias: false });
    // a name in both weeks appears once
    expect([...map.keys()].filter((k) => k === historyExerciseKey("Lat pull down"))).toHaveLength(1);
  });

  test("new names are unique; ids resolve created customs; aliases follow aliasesToSave", () => {
    const r = result();
    const map = historyExerciseMap(r, {});
    const names = historyNewExerciseNames(map);
    expect(names).toContain("Single-Arm Row");
    expect(names).not.toContain("Bench Press");
    expect(new Set(names.map((x) => x.toLowerCase())).size).toBe(names.length);

    const created = new Map(names.map((x) => [x.toLowerCase(), `id:${x}`]));
    const ids = historyExerciseIds(map, created);
    expect(ids[historyExerciseKey("SA Row")]).toBe("id:Single-Arm Row");
    expect(ids[historyExerciseKey("Bench press")]).toBe("bench");
    expect(Object.keys(ids)).toHaveLength(map.size);
    expect(Object.keys(historyExerciseIds(map))).toHaveLength(map.size - names.length);

    // nothing picked → nothing saved; a pick is saved
    expect(historyAliasesToSave(map, created)).toEqual([]);
    const squatKey = templateExercises(r, 1).find(({ ex }) => ex.sourceName === "Squat")!.key;
    const picked = historyExerciseMap(r, {
      [squatKey]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true },
    });
    expect(historyAliasesToSave(picked, created)).toEqual([{ alias: "Squat", exerciseId: "squat", source: "import" }]);
  });
});
