import { describe, expect, test } from "bun:test";
import { ImportChunk, buildImportResult, matchExercise, type ImportExercise } from "@pt/shared";
import { exercisesForSave, type DraftForm } from "./programForm";
import { choiceFor, formFromImport, templateExercises, type MatchChoice } from "./pasteImport";

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

describe("exercisesForSave", () => {
  const list = [
    { id: "a", role: "accessory" },
    { id: "b", role: "primary" },
    { id: "c", role: "core" },
  ];
  test("sorts by role by default", () => {
    expect(exercisesForSave(list, undefined).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(exercisesForSave(list, false).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
  test("keeps the editor's order with keepOrder", () => {
    const kept = exercisesForSave(list, true);
    expect(kept.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(kept).not.toBe(list);
  });
});

// FB-011: the trainer's Day 2, pasted
const DAY2 = [
  "Day 2 Deadlift + Horizontal",
  "Superset x 3 sets",
  "A1.Single leg throwball",
  "A2.Slamball side to side",
  "Superset x 3 sets",
  "B1.RowERG",
  "B2.Russain Twist",
  "Deadlift",
  "Supersets x 3sets",
  "Bench press",
  "Bent over row",
];

const CATALOG = [
  { id: "hop", name: "Single-Leg Hop" },
  { id: "dead", name: "Deadlift" },
  { id: "bench", name: "Bench Press" },
  { id: "row", name: "Bent-Over Row" },
  { id: "twist", name: "Russian Twist" },
];

describe("superset paste, end to end", () => {
  const ex = (line: number, name: string, notes: string | null, sourceName = name): ImportExercise => ({
    line,
    sourceName,
    name,
    notes,
    prescription: null,
  });
  const result = () => {
    const data = ImportChunk.parse({
      weeks: [
        {
          label: null,
          line: null,
          days: [
            {
              label: "Day 2 Deadlift + Horizontal",
              line: 1,
              sessions: [
                {
                  name: "Day 2 Deadlift + Horizontal",
                  line: 1,
                  kind: "lifting",
                  exercises: [
                    ex(3, "Single Leg Throwball", "Superset x 3 sets", "Single leg throwball"),
                    ex(4, "Slamball Side to Side", "Superset x 3 sets", "Slamball side to side"),
                    ex(6, "RowERG", "Superset x 3 sets"),
                    ex(7, "Russian Twist", "Superset x 3 sets", "Russain Twist"),
                    ex(8, "Deadlift", null),
                    ex(10, "Bench Press", "Supersets x 3sets", "Bench press"),
                    ex(11, "Bent Over Row", "Supersets x 3sets", "Bent over row"),
                  ],
                },
              ],
            },
          ],
        },
      ],
      skipped: [2, 5, 9].map((line) => ({ line, reason: "group header" })),
    });
    const r = buildImportResult(DAY2.join("\n"), [{ from: 1, to: DAY2.length, ok: true, data }]);
    for (const w of r.weeks) for (const d of w.days) for (const s of d.sessions) for (const e of s.exercises) e.match = matchExercise(e, CATALOG);
    return r;
  };
  const resolve = (c: MatchChoice) =>
    c.kind === "catalog" ? { exerciseId: c.exerciseId, exerciseName: c.exerciseName } : { exerciseId: `new:${c.exerciseName}`, exerciseName: c.exerciseName };
  let n = 0;
  const newKey = () => `k${++n}`;

  test("keeps the pasted order, 3 sets each, and only suggests the weak match", () => {
    const r = result();
    const throwball = templateExercises(r, 0)[0];
    expect(choiceFor({}, throwball.key, throwball.ex)).toEqual({ kind: "new", exerciseName: "Single Leg Throwball" });
    expect(throwball.ex.match?.candidates?.map((c) => c.name)).toContain("Single-Leg Hop");

    const form = formFromImport(r, 0, BASE, { choices: {}, resolve, newKey });
    expect(form.keepOrder).toBe(true);
    const saved = exercisesForSave(form.sessions[0].exercises, form.keepOrder);
    expect(saved.map((e) => e.exerciseName)).toEqual([
      "Single Leg Throwball",
      "Slamball Side to Side",
      "RowERG",
      "Russian Twist",
      "Deadlift",
      "Bench Press",
      "Bent-Over Row",
    ]);
    const counts = Object.fromEntries(saved.map((e) => [e.exerciseName, e.prescribedSets.length]));
    expect(counts).toMatchObject({
      "Single Leg Throwball": 3,
      "Slamball Side to Side": 3,
      RowERG: 3,
      "Russian Twist": 3,
      "Bench Press": 3,
      "Bent-Over Row": 3,
    });
    expect(saved.map((e) => e.group ?? null)).toEqual(["A", "A", "B", "B", null, "C", "C"]);
    // without keepOrder, role sorting would pull Deadlift ahead of the pairs
    expect(exercisesForSave(form.sessions[0].exercises, false)[0].exerciseName).not.toBe("Single Leg Throwball");
  });
});

describe("exercisesForSave with groups", () => {
  const set = (n: number) => ({ setNumber: n });
  test("a superset stays together when sorted by role", () => {
    const list = [
      { id: "core", role: "core", prescribedSets: [set(1)] },
      { id: "a1", role: "accessory", group: "B", prescribedSets: [set(1), set(2)] },
      { id: "a2", role: "primary", group: "B", prescribedSets: [set(1), set(2), set(3)] },
    ];
    const out = exercisesForSave(list, false);
    expect(out.map((e) => e.id)).toEqual(["a1", "a2", "core"]);
    expect(out.map((e) => e.group)).toEqual(["A", "A", undefined]);
    expect(out[0].prescribedSets.length).toBe(3);
  });
});
