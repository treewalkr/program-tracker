import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ImportChunk,
  buildImportResult,
  chunkLines,
  detectAb,
  groupBlocks,
  importLines,
  jaccard,
  mapCardio,
  groupSetCount,
  mapPrescription,
  normalizeExerciseName,
  numberedLines,
  weekExerciseNames,
  ImportExercise,
  type ImportResult,
  type ReviewExercise,
} from "./import";
import { WEEK11_12_EXTRACTION, mockImportExtraction } from "./importFixture";
import { PrescribedSet } from "./domain";

const FIXTURE = readFileSync(new URL("../fixtures/import/week11-12.txt", import.meta.url), "utf8");
const LINES = importLines(FIXTURE);

/** The fixture read the way the API reads it: chunk, mock-extract, merge. */
const fixtureResult = (): ImportResult =>
  buildImportResult(
    FIXTURE,
    chunkLines(LINES).map((r) => ({ ...r, ok: true as const, data: mockImportExtraction(LINES, r.from, r.to) })),
  );

const exercises = (r: ImportResult): ReviewExercise[] =>
  r.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions.flatMap((s) => s.exercises)));
const byLine = (r: ImportResult, line: number) => exercises(r).find((e) => e.line === line)!;
const warns = (e: { flags: { level: string; message: string }[] }) => e.flags.filter((f) => f.level === "warn").map((f) => f.message);

/** One-exercise result on a one-line text — for the checks. */
function single(line: string, ex: Partial<ImportExercise>): ReviewExercise {
  const data: ImportChunk = {
    weeks: [
      {
        label: null,
        line: null,
        days: [
          {
            label: "Day",
            line: 1,
            sessions: [
              {
                name: "S",
                kind: "lifting",
                line: 1,
                exercises: [{ line: 2, sourceName: "x", name: "x", prescription: null, ...ex }],
              },
            ],
          },
        ],
      },
    ],
    skipped: [],
  };
  return exercises(buildImportResult(`Day\n${line}`, [{ from: 1, to: 2, ok: true, data }]))[0];
}

describe("fixture", () => {
  test("is the verbatim paste, trailing spaces and all", () => {
    expect(LINES.length).toBe(61); // 60 lines + the final newline
    expect(LINES[9]).toEndWith("5(75kg) ");
    expect(LINES[14]).toBe("Day 2 Chest/Triceps ");
    expect(LINES[43]).toBe("Push up  failure x 3 sets - 9,10,10");
  });

  test("the hand-written extraction is a valid ImportChunk", () => {
    expect(ImportChunk.safeParse(WEEK11_12_EXTRACTION).success).toBe(true);
  });
});

describe("lines and chunks", () => {
  test("normalizes CRLF and CR", () => {
    expect(importLines("a\r\nb\rc\n")).toEqual(["a", "b", "c", ""]);
  });

  test("numbers lines globally", () => {
    expect(numberedLines(["Week 11", "", "Day 1"], 2, 3)).toBe("L2: \nL3: Day 1");
  });

  test("splits the fixture at its two week headers", () => {
    expect(chunkLines(LINES)).toEqual([
      { from: 1, to: 36 },
      { from: 37, to: 61 },
    ]);
  });

  test("keeps a preamble with content as its own chunk; drops an empty one", () => {
    expect(chunkLines(["Notes for Ada", "Week 1", "Squat 5x5"])).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 3 },
    ]);
    expect(chunkLines(["", "Week 1", "Squat 5x5"])).toEqual([{ from: 2, to: 3 }]);
    expect(chunkLines(["สัปดาห์ 1", "Squat", "wk 2", "Bench"])).toHaveLength(2);
  });

  test("without headers, cuts ~60-line chunks at blank or separator lines", () => {
    const lines = Array.from({ length: 150 }, (_, i) => (i % 10 === 9 ? "————" : `Row ${i + 1} 3x10`));
    const chunks = chunkLines(lines);
    expect(chunks[0]).toEqual({ from: 1, to: 60 });
    expect(chunks.at(-1)!.to).toBe(150);
    expect(chunks.every((c) => c.to - c.from + 1 <= 90)).toBe(true);
    // no breaks at all → hard cut
    expect(chunkLines(Array.from({ length: 200 }, () => "Squat 5x5"))[0]).toEqual({ from: 1, to: 90 });
  });
});

describe("fixture → result", () => {
  const r = fixtureResult();

  test("two weeks, every line used, no unread chunk", () => {
    expect(r.weeks.map((w) => w.label)).toEqual(["Week 11", "Week 12"]);
    expect(r.unused).toEqual([]);
    expect(r.unread).toEqual([]);
    expect(exercises(r)).toHaveLength(41);
  });

  test("Week 11 and Week 12 are two blocks, Week 12 the default", () => {
    expect(r.blocks).toEqual([{ weeks: [0] }, { weeks: [1] }]);
    expect(r.defaultBlock).toBe(1);
    expect(r.alternating).toBe(false);
    expect(jaccard(weekExerciseNames(r.weeks[0]), weekExerciseNames(r.weeks[1]))).toBeLessThan(0.6);
  });

  test("no value of the correct extraction is flagged amber — a stretch with no numbers included", () => {
    const amber = exercises(r).filter((e) => warns(e).length > 0);
    expect(amber.map((e) => e.line)).toEqual([]);
    expect(byLine(r, 4).flags).toEqual([]);
    expect(r.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions.flatMap((s) => warns(s))))).toEqual([]);
  });

  test("every mapped set is a valid PrescribedSet", () => {
    for (const e of exercises(r)) for (const s of e.sets) expect(PrescribedSet.safeParse(s).success).toBe(true);
  });

  test("maps the fixture's prescriptions onto sets", () => {
    expect(byLine(r, 4).sets).toEqual([{ setNumber: 1, type: "working", amrap: false, reps: 0, durationSeconds: 30 }]);
    // 6-10 reps x 3 sets
    expect(byLine(r, 7).sets.map((s) => [s.reps, s.repsMin])).toEqual([[10, 6], [10, 6], [10, 6]]);
    // pyramid
    expect(byLine(r, 9).sets.map((s) => s.reps)).toEqual([10, 8, 6, 5]);
    expect(byLine(r, 9).note).toBe("Pyramid · machine");
    // 10-15 sec x 1-2 sets → 2 × 15s, wording kept
    const stretch = byLine(r, 16);
    expect(stretch.sets.map((s) => [s.reps, s.durationSeconds])).toEqual([[0, 15], [0, 15]]);
    expect(stretch.note).toBe("PAILs/RAILs · 1–2 sets · 10–15s");
    expect(stretch.flags.filter((f) => f.level === "info").map((f) => f.message)).toEqual(["1–2 sets → 2 sets", "10–15s → 15s"]);
    // rounds
    expect(byLine(r, 17).sets[0]).toMatchObject({ reps: 5, repsMin: 3 });
    expect(byLine(r, 17).note).toBe("CARs · 1–2 sets · rounds");
    // 1 min → 60 s
    expect(byLine(r, 31).sets.map((s) => s.durationSeconds)).toEqual([60, 60, 60]);
    // failure
    expect(byLine(r, 44).sets.map((s) => [s.reps, s.amrap])).toEqual([[0, true], [0, true], [0, true]]);
    // steps
    expect(byLine(r, 58).note).toBe("steps");
    expect(byLine(r, 58).sets[0].reps).toBe(20);
  });

  test("cardio keeps the upper value and the wording", () => {
    const day1 = r.weeks[0].days[0].sessions[1];
    expect(day1.cardio).toEqual({ modality: "Cardio", durationMin: 60, hrZone: 3, intensity: "Zone 2–3 · 40–60 min" });
    expect(day1.flags.map((f) => [f.level, f.message])).toEqual([
      ["info", "Zone 2–3 → zone 3"],
      ["info", "40–60 min → 60 min"],
    ]);
    const run = r.weeks[0].days[1].sessions[1];
    expect(run.cardio).toEqual({ modality: "Run", durationMin: null, hrZone: 2, distanceKm: 10, intensity: "10 km++ · Zone 1–2" });
  });
});

describe("number checks", () => {
  test("a value not in the line is amber", () => {
    const e = single("Squat 5 reps x 3 sets", { sourceName: "Squat", prescription: { sets: 4, reps: 5 } });
    expect(warns(e)).toEqual(["Sets 4: value not found in the text"]);
  });

  test("a number inside the exercise name can't be reps, sets or load", () => {
    const e = single("DB Incline 45 degrees Bench press 12 reps x 4 sets - 12(16kg)", {
      sourceName: "DB Incline 45 degrees Bench press",
      prescription: { sets: 4, reps: 12 },
      actuals: [{ reps: 12, kg: 45 }],
    });
    expect(warns(e)).toEqual(["Logged load 45: this number looks like part of the name"]);
  });

  test("one occurrence can't fill two fields", () => {
    const e = single("Plank 3 x 30 sec", { sourceName: "Plank", prescription: { sets: 3, reps: 3, seconds: 30 } });
    expect(warns(e)).toEqual(["Sets 3: that number is already used for another value"]);
  });

  test("tags right after the name count as the name", () => {
    const e = single("Row (Tempo 3) 8 reps x 4 sets", { sourceName: "Row", prescription: { sets: 3, reps: 8 } });
    expect(warns(e)).toEqual(["Sets 3: this number looks like part of the name"]);
  });

  test("minutes justify seconds, a pyramid justifies its set count", () => {
    expect(warns(single("Swing 2 min x 3 sets", { sourceName: "Swing", prescription: { sets: 3, seconds: 120 } }))).toEqual([]);
    expect(warns(single("Row 10/8/6 reps", { sourceName: "Row", prescription: { sets: 3, repsList: [10, 8, 6] } }))).toEqual([]);
  });

  test("actuals may repeat a value written once (x 3 sets)", () => {
    const e = single("KB Squat 10 reps x 3 sets - 10(12kg) x 3sets", {
      sourceName: "KB Squat",
      prescription: { sets: 3, reps: 10 },
      actuals: [{ reps: 10, kg: 12 }, { reps: 10, kg: 12 }, { reps: 10, kg: 12 }],
    });
    expect(warns(e)).toEqual([]);
  });

  test("an invented actual is amber", () => {
    const e = single("Squat 5 reps x 1 sets - 5(100kg)", {
      sourceName: "Squat",
      prescription: { sets: 1, reps: 5 },
      actuals: [{ reps: 5, kg: 110 }],
    });
    expect(warns(e)).toEqual(["Logged load 110: value not found in the text"]);
  });
});

describe("plausibility", () => {
  test("flags unusual reps, sets, load and time", () => {
    const e = single("Squat 50 reps x 12 sets - 50(500kg)", {
      sourceName: "Squat",
      prescription: { sets: 12, reps: 50 },
      actuals: [{ reps: 50, kg: 500 }],
    });
    expect(warns(e)).toEqual([
      "Reps 50: unusual value, check it",
      "Sets 12: unusual value, check it",
      "Logged reps 50: unusual value, check it",
      "Logged load 500: unusual value, check it",
    ]);
  });

  test("steps and rounds may go to 100", () => {
    const e = single("Walk 60 steps x 2 sets", { sourceName: "Walk", prescription: { sets: 2, reps: 60, unit: "steps" } });
    expect(warns(e)).toEqual([]);
  });
});

describe("mapping", () => {
  test("no set count → 1 set, amber", () => {
    const m = mapPrescription({ sets: null, reps: 8 });
    expect(m.sets).toHaveLength(1);
    expect(m.flags.map((f) => f.code)).toEqual(["no_sets"]);
  });

  test("more than 20 sets is a blocking limit", () => {
    const m = mapPrescription({ sets: 25, reps: 5 });
    expect(m.sets).toHaveLength(20);
    expect(m.flags).toContainEqual(expect.objectContaining({ code: "limit", blocking: true }));
  });

  test("no reps and no time → 10 reps, amber", () => {
    const m = mapPrescription({ sets: 2 });
    expect(m.sets.map((s) => s.reps)).toEqual([10, 10]);
    expect(m.flags.map((f) => f.code)).toEqual(["no_reps"]);
  });

  test("cardio out-of-range values are dropped from the mapped form", () => {
    expect(mapCardio({ modality: "Run", hrZone: 7, durationMin: 500 }).cardio).toEqual({ modality: "Run", durationMin: null, hrZone: null });
  });
});

describe("header-less text", () => {
  test("a blank or missing day label and session name parse and get a fallback", () => {
    const raw = {
      weeks: [
        {
          label: null,
          line: null,
          days: [
            { label: "", line: 1, sessions: [{ name: "", kind: "lifting", line: 1, exercises: [] }] },
            {
              label: null,
              line: null,
              sessions: [{ name: null, kind: "lifting", line: null, exercises: [{ line: 2, sourceName: "Bench", name: "Bench", prescription: { sets: 5, reps: 5 } }] }],
            },
          ],
        },
      ],
      skipped: [],
    };
    const data = ImportChunk.parse(raw);
    const r = buildImportResult("Squat 5x5\nBench 5x5", [{ from: 1, to: 2, ok: true, data }]);
    expect(r.weeks[0].days.map((d) => d.label)).toEqual(["Day 1", "Day 2"]);
    expect(r.weeks[0].days.map((d) => d.sessions[0].name)).toEqual(["Session 1", "Session 1"]);
    // no day or session line → anchored to the first exercise
    expect(r.weeks[0].days[1].line).toBe(2);
    expect(r.weeks[0].days[1].sessions[0].line).toBe(2);
    expect(r.unused).toEqual([]);
  });
});

describe("coverage and limits", () => {
  test("unreferenced lines are unused; skipped lines and separators are not; unread chunks are not", () => {
    const text = "Week 1\nDay 1 Legs\nSquat 5x5\nchit chat\n————\nsee you\nWeek 2\nDay 1\nBench 5x5";
    const data: ImportChunk = {
      weeks: [
        {
          label: "Week 1",
          line: 1,
          days: [{ label: "Day 1 Legs", line: 2, sessions: [{ name: "Legs", kind: "lifting", line: 2, exercises: [] }] }],
        },
      ],
      skipped: [{ line: 6, reason: "sign-off" }],
    };
    const r = buildImportResult(text, [
      { from: 1, to: 6, ok: true, data },
      { from: 7, to: 9, ok: false, error: "provider returned 500" },
    ]);
    expect(r.unused).toEqual([3, 4]);
    expect(r.unread).toEqual([{ from: 7, to: 9, error: "provider returned 500" }]);
  });

  test("too many days, sessions and exercises block", () => {
    const ex = (line: number): ImportExercise => ({ line, sourceName: "Squat", name: "Squat", prescription: { sets: 1, reps: 5 } });
    const data: ImportChunk = {
      weeks: [
        {
          label: null,
          line: null,
          days: Array.from({ length: 8 }, (_, d) => ({
            label: `Day ${d + 1}`,
            line: 1,
            sessions: Array.from({ length: d === 0 ? 5 : 1 }, () => ({
              name: "S",
              kind: "lifting" as const,
              line: 1,
              exercises: Array.from({ length: d === 1 ? 21 : 1 }, () => ex(1)),
            })),
          })),
        },
      ],
      skipped: [],
    };
    const r = buildImportResult("Squat 1 x 5", [{ from: 1, to: 1, ok: true, data }]);
    expect(r.weeks[0].flags[0]).toMatchObject({ code: "limit", blocking: true });
    expect(r.weeks[0].days[0].flags[0]).toMatchObject({ code: "limit", blocking: true });
    expect(r.weeks[0].days[1].sessions[0].flags[0]).toMatchObject({ code: "limit", blocking: true });
  });
});

describe("block grouping", () => {
  const week = (...names: string[]) => ({ days: [{ sessions: [{ exercises: names.map((sourceName) => ({ sourceName })) }] }] });

  test("normalizes names: case, (tags), punctuation, spaces", () => {
    expect(normalizeExerciseName("  Lat pull-down (Pyramid)  ")).toBe("lat pull down");
    expect(normalizeExerciseName("Crossover / Dip")).toBe("crossover dip");
  });

  test("similar consecutive weeks share a block (progression)", () => {
    const g = groupBlocks([week("Squat", "Bench", "Row"), week("squat", "Bench (Paused)", "Row"), week("Deadlift", "Press")]);
    expect(g.blocks).toEqual([{ weeks: [0, 1] }, { weeks: [2] }]);
    expect(g.alternating).toBe(false);
  });

  test("detects alternating A/B weeks", () => {
    const a = week("Squat", "Bench", "Row");
    const b = week("Deadlift", "Press", "Chin up");
    expect(groupBlocks([a, b, a, b]).alternating).toBe(true);
  });

  test("A/B weeks: W1 ≠ W2 and W3 ≈ W1 suggests the latest A and B weeks", () => {
    const a = week("Squat", "Bench", "Row");
    const b = week("Deadlift", "Press", "Chin up");
    expect(detectAb([a, b, a])).toEqual({ a: 2, b: 1, source: "pattern" });
    expect(detectAb([a, b, a, b])).toEqual({ a: 2, b: 3, source: "pattern" });
  });

  test("A/B weeks: no suggestion for two weeks, same weeks, a block change or an empty week", () => {
    const a = week("Squat", "Bench", "Row");
    const b = week("Deadlift", "Press", "Chin up");
    const c = week("Lunge", "Dip", "Curl");
    expect(detectAb([a, b])).toBeNull();
    expect(detectAb([a, a, a])).toBeNull();
    expect(detectAb([a, b, c])).toBeNull();
    expect(detectAb([a, b, a, c])).toBeNull();
    expect(detectAb([a, week(), a])).toBeNull();
  });

  test("A/B weeks: the notes' letters win, even with only two weeks", () => {
    const a = { ...week("Squat"), rotation: "A" as const };
    const b = { ...week("Deadlift"), rotation: "B" as const };
    expect(detectAb([a, b])).toEqual({ a: 0, b: 1, source: "notes" });
    expect(detectAb([a, b, a, b])).toEqual({ a: 2, b: 3, source: "notes" });
    expect(detectAb([a, week("Deadlift")])).toBeNull();
  });

  test("buildImportResult keeps the week letters and suggests A/B", () => {
    const ex = (line: number, sourceName: string) => ({ line, sourceName, name: sourceName, prescription: { sets: 3, reps: 5 } });
    const wk = (label: string, line: number, rotation: "A" | "B", name: string) => ({
      label,
      line,
      rotation,
      days: [{ label: "Day 1", line: line + 1, sessions: [{ name: "Day 1", kind: "lifting" as const, line: line + 1, exercises: [ex(line + 2, name)] }] }],
    });
    const text = ["Week A", "Day 1", "Squat 3x5", "Week B", "Day 1", "Deadlift 3x5"].join("\n");
    const data = ImportChunk.parse({ weeks: [wk("Week A", 1, "A", "Squat"), wk("Week B", 4, "B", "Deadlift")], skipped: [] });
    const r = buildImportResult(text, [{ from: 1, to: 6, ok: true, data }]);
    expect(r.weeks.map((w) => w.rotation)).toEqual(["A", "B"]);
    expect(r.ab).toEqual({ a: 0, b: 1, source: "notes" });
    expect(fixtureResult().ab).toBeNull();
  });

  test("a paste without week headers is one block", () => {
    const r = buildImportResult("x", [
      { from: 1, to: 1, ok: true, data: { weeks: [{ label: null, line: null, days: [] }], skipped: [] } },
      { from: 1, to: 1, ok: true, data: { weeks: [{ label: null, line: null, days: [] }], skipped: [] } },
    ]);
    expect(r.weeks).toHaveLength(1);
    expect(r.blocks).toEqual([{ weeks: [0] }]);
  });
});

describe("mock extraction", () => {
  test("returns only the chunk's part of the fixture", () => {
    const week12 = mockImportExtraction(LINES, 37, 61);
    expect(week12.weeks.map((w) => w.label)).toEqual(["Week 12"]);
  });

  test("other text comes back empty", () => {
    expect(mockImportExtraction(["Week 1", "Squat 5x5"], 1, 2).weeks).toEqual([]);
  });
});

describe("no prescription", () => {
  test("a stretch or mobility drill with no numbers is not flagged", () => {
    for (const n of ["Lateral Stretch", "Hip CARs", "Foam rolling", "Warm up", "Chest (PAILs/RAILs)"]) {
      expect(mapPrescription(null, n).flags).toEqual([]);
    }
  });
  test("a lift with no numbers is still flagged", () => {
    expect(mapPrescription(null, "Bench Press").flags.map((f) => f.code)).toEqual(["no_prescription"]);
  });
});

describe("day numbers starting again", () => {
  const day = (n: number, line: number, name: string) => ({
    label: `Day ${n} ${name}`,
    line,
    sessions: [{ name, kind: "lifting" as const, line, exercises: [{ line: line + 1, sourceName: name, name, prescription: { sets: 3, reps: 5 } }] }],
  });
  const text = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? `Day ${i}` : "Squat 3x5")).join("\n");

  test("Day 1–2, then Day 1–2 again → two parts, the second flagged", () => {
    const data = ImportChunk.parse({
      weeks: [{ label: null, line: null, days: [day(1, 1, "A"), day(2, 3, "B"), day(1, 5, "C"), day(2, 7, "D")] }],
      skipped: [],
    });
    const r = buildImportResult(text, [{ from: 1, to: 14, ok: true, data }]);
    expect(r.weeks.map((w) => [w.label, w.line, w.days.length])).toEqual([
      ["Part 1", null, 2],
      ["Part 2", 5, 2],
    ]);
    expect(r.weeks[0].flags).toEqual([]);
    expect(r.weeks[1].flags.map((f) => [f.level, f.message])).toEqual([["info", "Day numbers start again at line 5 — read as a new part"]]);
    expect(r.blocks).toEqual([{ weeks: [0] }, { weeks: [1] }]);
  });

  test("a labelled week keeps its label; days counting up are not split", () => {
    const data = ImportChunk.parse({
      weeks: [
        { label: "Week 3", line: 1, days: [day(1, 1, "A"), day(1, 3, "B")] },
        { label: "Week 4", line: 5, days: [day(1, 5, "A"), day(2, 7, "B"), day(3, 9, "C")] },
      ],
      skipped: [],
    });
    const r = buildImportResult(text, [{ from: 1, to: 14, ok: true, data }]);
    expect(r.weeks.map((w) => w.label)).toEqual(["Week 3 (part 1)", "Week 3 (part 2)", "Week 4"]);
  });
});

describe("groupSetCount", () => {
  test("reads the set count from superset and circuit headers", () => {
    expect(groupSetCount("Superset x 3 sets")).toBe(3);
    expect(groupSetCount("Supersets x 3sets")).toBe(3);
    expect(groupSetCount("Circuit – 3 rounds")).toBe(3);
    expect(groupSetCount("Giant set ×4")).toBe(4);
    expect(groupSetCount("Tri-set x 2")).toBe(2);
    expect(groupSetCount("ซุปเปอร์เซ็ต 3 เซ็ต")).toBe(3);
    expect(groupSetCount("ซุปเปอร์เซ็ต x 4 รอบ")).toBe(4);
  });
  test("ignores timed groups, plain notes and silly counts", () => {
    expect(groupSetCount("EMOM 10 min superset")).toBeNull();
    expect(groupSetCount("Circuit AMRAP 3 rounds")).toBeNull();
    expect(groupSetCount("Circuit for 12 min")).toBeNull();
    expect(groupSetCount("3 sets, slow tempo")).toBeNull();
    expect(groupSetCount("Superset with B2")).toBeNull();
    expect(groupSetCount("Superset x 10 reps")).toBeNull();
    expect(groupSetCount("Superset x 50 sets")).toBeNull();
    expect(groupSetCount(null)).toBeNull();
  });
});

describe("mapPrescription with a group set count", () => {
  test("reps without sets take the group's count", () => {
    const m = mapPrescription({ sets: null, reps: 10 }, "Squat", 3);
    expect(m.sets.map((s) => s.reps)).toEqual([10, 10, 10]);
    expect(m.flags.map((f) => f.code)).toEqual(["group_sets"]);
  });
  test("timed without sets takes the group's count", () => {
    const m = mapPrescription({ sets: null, seconds: 60 }, "Farmer carry", 3);
    expect(m.sets.map((s) => s.durationSeconds)).toEqual([60, 60, 60]);
  });
  test("no numbers → N × the 30s placeholder, still flagged", () => {
    const m = mapPrescription(null, "Slamball side to side", 3);
    expect(m.sets).toHaveLength(3);
    expect(m.sets.every((s) => s.durationSeconds === 30)).toBe(true);
    expect(m.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(m.flags.map((f) => f.code)).toEqual([
      "group_sets",
      "no_prescription",
    ]);
    expect(m.flags[1].message).toContain("3 × 30s");
  });
  test("the exercise's own set count wins", () => {
    const m = mapPrescription({ sets: 4, reps: 8 }, "Bench Press", 3);
    expect(m.sets).toHaveLength(4);
    expect(m.flags).toEqual([]);
    expect(
      mapPrescription({ sets: null, repsList: [10, 8] }, "Row", 3).sets,
    ).toHaveLength(2);
  });
});

describe("buildImportResult applies group headers", () => {
  test("superset exercises get the header's set count", () => {
    const text = [
      "Superset x 3 sets",
      "A1.Squat 40 kg x 10 reps",
      "A2.Slamball side to side",
    ].join("\n");
    const exercise = (
      line: number,
      sourceName: string,
      prescription: ImportExercise["prescription"],
    ): ImportExercise => ({
      line,
      sourceName,
      name: sourceName,
      notes: "Superset x 3 sets",
      prescription,
    });
    const data = ImportChunk.parse({
      weeks: [
        {
          label: null,
          line: null,
          days: [
            {
              label: "Day 1",
              line: null,
              sessions: [
                {
                  name: "",
                  kind: "lifting",
                  exercises: [
                    exercise(2, "Squat", { sets: null, reps: 10 }),
                    exercise(3, "Slamball side to side", null),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = buildImportResult(text, [{ from: 1, to: 3, ok: true, data }]);
    const ex = r.weeks[0].days[0].sessions[0].exercises;
    expect(ex.map((e) => e.sets.length)).toEqual([3, 3]);
    expect(ex[0].sets[0].reps).toBe(10);
  });
});

describe("buildImportResult makes supersets", () => {
  const run = (text: string, exercises: Partial<ImportExercise>[]) => {
    const data = ImportChunk.parse({
      weeks: [
        {
          label: null,
          line: null,
          days: [
            {
              label: "Day 1",
              line: null,
              sessions: [
                {
                  name: "",
                  kind: "lifting",
                  exercises: exercises.map((e) => ({ name: e.sourceName, notes: null, prescription: null, ...e })),
                },
              ],
            },
          ],
        },
      ],
    });
    const lines = text.split("\n").length;
    return buildImportResult(text, [{ from: 1, to: lines, ok: true, data }]).weeks[0].days[0].sessions[0].exercises;
  };

  test("FB-011: header plus A1/A2 gives group A with 3 rounds", () => {
    const ex = run("Superset x 3 sets\nA1.Single leg throwball\nA2.Slamball side to side", [
      { line: 2, sourceName: "Single leg throwball", notes: "Superset x 3 sets", group: "A" },
      { line: 3, sourceName: "Slamball side to side", notes: "Superset x 3 sets", group: "A" },
    ]);
    expect(ex.map((e) => e.group)).toEqual(["A", "A"]);
    expect(ex.map((e) => e.sets.length)).toEqual([3, 3]);
    expect(ex.map((e) => e.note)).toEqual(["", ""]);
  });

  test("header only: same header in notes, no group from the model", () => {
    const ex = run("Back squat 5x5\nCircuit 3 rounds\nPush up x10\nRow x10\nPlank 3x30s", [
      { line: 1, sourceName: "Back squat", prescription: { sets: 5, reps: 5 } },
      { line: 3, sourceName: "Push up", notes: "Circuit 3 rounds", prescription: { sets: null, reps: 10 } },
      { line: 4, sourceName: "Row", notes: "Circuit 3 rounds", prescription: { sets: null, reps: 10 } },
      { line: 5, sourceName: "Plank", prescription: { sets: 3, seconds: 30 } },
    ]);
    expect(ex.map((e) => e.group ?? null)).toEqual([null, "A", "A", null]);
    expect(ex.slice(1, 3).map((e) => e.sets.length)).toEqual([3, 3]);
  });

  test("A1/A2 prefixes alone make a group; set counts brought up", () => {
    const ex = run("B1. Bench 4x8\nB2. Row 3x10\nC1 Curl 3x12", [
      { line: 1, sourceName: "Bench", prescription: { sets: 4, reps: 8 } },
      { line: 2, sourceName: "Row", prescription: { sets: 3, reps: 10 } },
      { line: 3, sourceName: "Curl", prescription: { sets: 3, reps: 12 } },
    ]);
    expect(ex.map((e) => e.group ?? null)).toEqual(["A", "A", null]);
    expect(ex.map((e) => e.sets.length)).toEqual([4, 4, 3]);
  });

  test("a bad group value from the model is ignored", () => {
    expect(ImportExercise.parse({ line: 1, sourceName: "x", name: "x", prescription: null, group: 42 }).group).toBeNull();
  });
});
