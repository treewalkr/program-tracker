import { describe, expect, test } from "bun:test";
import { ImportChunk, buildImportResult, matchExercise, type ImportExercise } from "@pt/shared";
import { cloneSessionRows, exercisesForSave, type DraftForm, type SessionRow } from "./programForm";
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
  test("keeps the editor's order — no role sort", () => {
    const list = [
      { id: "squat", role: undefined },
      { id: "bench", role: "strength" },
      { id: "chin", role: "strength" },
    ];
    const saved = exercisesForSave(list);
    expect(saved.map((e) => e.id)).toEqual(["squat", "bench", "chin"]);
    expect(saved).not.toBe(list);
  });
});

describe("cloneSessionRows", () => {
  test("Week B starts as a deep copy of A with fresh keys and exercise ids", () => {
    const a: SessionRow[] = [
      {
        key: "k1",
        name: "Lower",
        kind: "lifting",
        cardio: { modality: "", durationMin: 30, hrZone: 2 },
        exercises: [{ id: "e1", exerciseId: "squat", order: 0, prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }] }],
      },
    ];
    let n = 0;
    const b = cloneSessionRows(a, () => `id${++n}`);
    expect(b[0].key).toBe("id1");
    expect(b[0].exercises[0].id).toBe("id2");
    expect(b[0].exercises[0].exerciseId).toBe("squat");
    b[0].exercises[0].prescribedSets[0].reps = 8;
    b[0].name = "Upper";
    expect(a[0].exercises[0].prescribedSets[0].reps).toBe(5);
    expect(a[0].name).toBe("Lower");
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
    const saved = exercisesForSave(form.sessions[0].exercises);
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
  });
});

describe("exercisesForSave with groups", () => {
  const set = (n: number) => ({ setNumber: n });
  test("tidies groups in place: re-lettered, rounds evened", () => {
    const list = [
      { id: "core", prescribedSets: [set(1)] },
      { id: "a1", group: "B", prescribedSets: [set(1), set(2)] },
      { id: "a2", group: "B", prescribedSets: [set(1), set(2), set(3)] },
    ];
    const out = exercisesForSave(list);
    expect(out.map((e) => e.id)).toEqual(["core", "a1", "a2"]);
    expect(out.map((e) => e.group)).toEqual([undefined, "A", "A"]);
    expect(out[1].prescribedSets.length).toBe(3);
  });
});
