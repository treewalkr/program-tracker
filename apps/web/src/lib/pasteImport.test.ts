import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildImportResult,
  chunkLines,
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

  test("only confirmed choices become aliases, keyed by the name as written", () => {
    const r = result();
    const items = templateExercises(r, 1);
    const squat = items.find(({ ex }) => ex.line === 56)!;
    const dip = items.find(({ ex }) => ex.line === 43)!;
    const choices: Record<string, ChoiceState> = {
      [squat.key]: { choice: choiceFor({}, squat.key, squat.ex), confirmed: true },
      [dip.key]: { choice: { kind: "new", exerciseName: "Crossover / Dip" }, confirmed: true },
    };
    expect(aliasesToSave(r, 1, choices, new Map([["crossover / dip", "dip-id"]]))).toEqual([
      { alias: "Crossover / Dip", exerciseId: "dip-id", source: "import" },
      { alias: "Squat", exerciseId: "squat", source: "import" },
    ]);
    expect(aliasesToSave(r, 1, {})).toEqual([]);
  });
});

describe("flags and lines", () => {
  test("summarizes the block: amber, info, matches to confirm, nothing blocking", () => {
    const r = result();
    const s = flagSummary(r, 0);
    expect(s.amber).toBe(1); // Lateral Stretch has no prescription
    expect(s.info).toBeGreaterThan(0);
    expect(s.blocking).toEqual([]);
    expect(s.unused).toBe(0);
    const w12 = flagSummary(r, 1);
    expect(w12.toConfirm).toBe(2); // Incline bench press → Bench Press?, Squat → Back Squat?
    const key = templateExercises(r, 1).find(({ ex }) => ex.line === 56)!.key;
    expect(flagSummary(r, 1, { [key]: { choice: { kind: "catalog", exerciseId: "squat", exerciseName: "Back Squat" }, confirmed: true } }).toConfirm).toBe(1);
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
    expect(states[3]).toBe("flagged"); // no prescription
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
