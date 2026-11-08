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
  aliasesToSave,
  blockLabel,
  choiceFor,
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
  test("labels each block with its weeks and the template week's lifting days", () => {
    const r = result();
    expect(blockLabel(r, 0)).toBe("Week 11 (Back/Biceps · Chest/Triceps · Lower)");
    expect(blockLabel(r, 1)).toBe("Week 12 (Upper Push · Upper Pull · Lower)");
  });
});

describe("formFromImport", () => {
  test("drafts the default block (Week 12) as the form", () => {
    const r = result();
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey });
    expect(form.name).toBe("Upper Push / Upper Pull / Lower");
    expect(form.plannedWeeks).toBe(4); // one week in the block → default kept
    expect(form.phase).toBe("accumulation");
    expect(form.sessions.map((s) => [s.name, s.kind, s.exercises.length])).toEqual([
      ["Upper Push", "lifting", 6],
      ["Upper Pull", "lifting", 6],
      ["Lower", "lifting", 5],
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
    for (const s of form.sessions.filter((s) => s.kind === "lifting")) {
      expect(s.exercises.every((e) => !!e.role)).toBe(true);
      expect(s.exercises.map((e) => e.order)).toEqual(s.exercises.map((_, i) => i));
    }
    expect(form.sessions.flatMap((s) => s.exercises.map((e) => `${e.exerciseName}: ${e.role}`))).toMatchSnapshot();
  });

  test("catalog patterns steer the suggestion", () => {
    const r = result();
    const catalog = [{ id: "bench", name: "Bench Press", primaryMuscleGroup: "core", equipment: "barbell", movementPattern: "anti_extension" }];
    const form = formFromImport(r, r.defaultBlock, BASE, { choices: {}, resolve, newKey, catalog });
    const bench = form.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === "bench");
    expect(bench?.role).toBe("core");
  });

  test("Week 11 keeps its cardio sessions, with the wording in intensity", () => {
    const r = result();
    const form = formFromImport(r, 0, BASE, { choices: {}, resolve, newKey });
    expect(form.sessions.map((s) => s.kind)).toEqual(["lifting", "cardio", "lifting", "cardio", "lifting"]);
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

describe("matches", () => {
  test("default choice follows the match", () => {
    expect(defaultChoice({ kind: "fuzzy", exerciseId: "x", exerciseName: "X" }, "y")).toEqual({ kind: "catalog", exerciseId: "x", exerciseName: "X" });
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

  test("picks and the fuzzy matches let stand become aliases, keyed by the name as written", () => {
    const r = result();
    const items = templateExercises(r, 1);
    const squat = items.find(({ ex }) => ex.line === 56)!;
    const dip = items.find(({ ex }) => ex.line === 43)!;
    const choices: Record<string, ChoiceState> = {
      [squat.key]: { choice: choiceFor({}, squat.key, squat.ex), confirmed: true },
      [dip.key]: { choice: { kind: "new", exerciseName: "Crossover / Dip" }, confirmed: true },
    };
    expect(aliasesToSave(r, 1, choices, new Map([["crossover / dip", "dip-id"]]))).toEqual([
      { alias: "Incline bench press", exerciseId: "bench", source: "import" },
      { alias: "Crossover / Dip", exerciseId: "dip-id", source: "import" },
      { alias: "Squat", exerciseId: "squat", source: "import" },
    ]);
    // untouched: the fuzzy matches are accepted by default
    expect(aliasesToSave(r, 1, {}).map((a) => a.alias).sort()).toEqual(["Incline bench press", "Squat"]);
    // changed to a new exercise that wasn't created → nothing to point at
    expect(aliasesToSave(r, 1, { [squat.key]: { choice: { kind: "new", exerciseName: "Squat" }, confirmed: true } }).map((a) => a.alias)).toEqual([
      "Incline bench press",
    ]);
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
    expect(w12.matched).toBe(2); // Incline bench press → Bench Press, Squat → Back Squat
    const key = templateExercises(r, 1).find(({ ex }) => ex.line === 56)!.key;
    expect(flagSummary(r, 1, { [key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true } }).matched).toBe(1);
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

    // fuzzy matches let stand are saved (here: Squat → Back Squat and two bench presses), exact ones aren't
    const aliases = historyAliasesToSave(map, created);
    expect(aliases).toContainEqual({ alias: "Squat", exerciseId: "squat", source: "import" });
    const fuzzy = new Set(
      r.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises.filter((e) => e.match?.kind === "fuzzy").map((e) => e.sourceName)))),
    );
    expect(aliases.every((a) => fuzzy.has(a.alias))).toBe(true);
    expect(aliases.map((a) => a.alias)).not.toContain("Bench press");
  });
});
