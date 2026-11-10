import { describe, expect, test } from "bun:test";
import type { SessionLogRow, SetLogRow } from "@pt/db";
import { buildHistory, estimateTokens, HISTORY_TOKEN_BUDGET, renderTrainingLog, sessionLabelsFor } from "./lib/history";

const logs = [{ id: "log-1" }] as SessionLogRow[];
const set = (exerciseId: string, type: string, weightKg: string | null, reps: number, rpe: string | null = null) =>
  ({ sessionLogId: "log-1", exerciseId, type, weightKg, reps, rpe }) as unknown as SetLogRow;
const catalog = [
  { id: "ex-squat", name: "Squat" },
  { id: "ex-plank", name: "Plank" },
];

test("history lists back-off sets alongside working sets (F02)", () => {
  const [squat] = buildHistory({
    logs,
    sets: [set("ex-squat", "working", "150", 3, "8"), set("ex-squat", "backoff", "137.5", 4, "9.5")],
    catalog,
  });
  expect(squat.recentSets).toEqual(["150kg × 3 @ RPE 8", "137.5kg × 4 @ RPE 9.5"]);
});

test("timed holds read as seconds and never get an e1RM (F15)", () => {
  const [plank] = buildHistory({
    logs,
    sets: [set("ex-plank", "working", "10", 45, "8")],
    catalog,
    timedExerciseIds: new Set(["ex-plank"]),
  });
  expect(plank.recentSets).toEqual(["10kg × 45 s @ RPE 8"]);
  expect(plank.bestE1rm).toBe(0);
});

test("a hold swapped into a timed slot still reads as seconds", () => {
  const swapped = { ...set("ex-side", "working", null, 45, "7"), programExerciseId: "pe-plank" } as unknown as SetLogRow;
  const [side] = buildHistory({
    logs,
    sets: [swapped],
    catalog: [...catalog, { id: "ex-side", name: "Side Plank" }],
    timedExerciseIds: new Set(["ex-plank"]),
    timedSlotIds: new Set(["pe-plank"]),
  });
  expect(side.recentSets).toEqual(["45 s @ RPE 7"]);
  expect(side.bestE1rm).toBe(0);
});

// ---------------------------------------------------------------------------
// Dated training log for AI grounding (F11)
// ---------------------------------------------------------------------------

type LogFixture = Parameters<typeof renderTrainingLog>[0]["logs"][number];
type SetFixture = Parameters<typeof renderTrainingLog>[0]["sets"][number];

const lifting = (id: string, date: string, programSessionId: string | null = null): LogFixture => ({
  id,
  date,
  kind: "lifting",
  cardio: null,
  programSessionId,
});
const cardioLog = (id: string, date: string, cardio: LogFixture["cardio"], programSessionId: string | null = null): LogFixture => ({
  id,
  date,
  kind: "cardio",
  cardio,
  programSessionId,
});
const s = (
  sessionLogId: string,
  exerciseId: string,
  setNumber: number,
  weightKg: string | null,
  reps: number,
  rpe: string | null = null,
  type: "working" | "backoff" = "working"
): SetFixture => ({ sessionLogId, exerciseId, setNumber, type, weightKg, reps, rpe });

const logCatalog = [
  { id: "ex-squat", name: "Squat" },
  { id: "ex-bench", name: "Bench" },
  { id: "ex-plank", name: "Plank" },
  { id: "ex-pullup", name: "Pull-up" },
];
const sessionLabels = new Map([
  ["ps-1", "Session 1 (Lower)"],
  ["ps-2", "Session 2 (Upper)"],
  ["pc-1", "Cardio 1"],
]);

describe("renderTrainingLog", () => {
  test("renders every set, dated and grouped per session, newest first, with back-offs, holds and cardio", () => {
    const text = renderTrainingLog({
      logs: [
        lifting("a", "2026-10-22", "ps-1"),
        cardioLog("c", "2026-11-04", { modality: "Run", durationMin: 30, hrZone: 2, rpe: 6, distanceKm: 5.2 }, "pc-1"),
        lifting("b", "2026-11-05", "ps-2"),
      ],
      sets: [
        s("a", "ex-squat", 1, "140", 5, "7"),
        s("a", "ex-plank", 1, "10", 45, "8"),
        s("a", "ex-pullup", 1, null, 8, "8"),
        // back-off logged before the working set still renders after it
        s("b", "ex-squat", 3, "137.5", 4, "9.5", "backoff"),
        s("b", "ex-squat", 1, "140", 5, "9"),
        s("b", "ex-squat", 2, "140", 5, "9"),
        s("b", "ex-bench", 1, "107.5", 3, "9"),
      ],
      catalog: logCatalog,
      timedExerciseIds: new Set(["ex-plank"]),
      sessionLabels,
    });
    expect(text).toBe(
      [
        "2026-11-05 Session 2 (Upper): Squat 140×5@9, 140×5@9, 137.5×4@9.5 (back-off); Bench 107.5×3@9",
        "2026-11-04 Cardio 1: Run 30 min, zone 2, RPE 6, 5.2 km",
        "2026-10-22 Session 1 (Lower): Squat 140×5@7; Plank 10kg×45s@8; Pull-up bw×8@8",
      ].join("\n")
    );
  });

  test("freestyle logs and sparse cardio still render; empty logs render nothing", () => {
    const text = renderTrainingLog({
      logs: [lifting("f", "2026-11-01"), cardioLog("r", "2026-11-02", { modality: "Bike", intensity: "easy" })],
      sets: [s("f", "ex-bench", 1, "100", 5)],
      catalog: logCatalog,
    });
    expect(text).toBe(["2026-11-02 Cardio: Bike easy", "2026-11-01 Freestyle: Bench 100×5"].join("\n"));
    expect(renderTrainingLog({ logs: [], sets: [], catalog: logCatalog })).toBe("");
  });

  test("readiness and flags ride on each session line, with a flag summary on top", () => {
    const flagged = (id: string, date: string, extra: Partial<LogFixture>): LogFixture => ({ ...lifting(id, date, "ps-1"), ...extra });
    const text = renderTrainingLog({
      logs: [
        flagged("a", "2026-11-01", {
          perceivedEnergy: 6,
          readiness: { sleep: 2, soreness: 4 },
          flags: [{ programExerciseId: null, exerciseId: "ex-squat", kind: "pain", note: "knee twinge" }],
        }),
        flagged("b", "2026-11-05", {
          readiness: { sleep: 2 },
          flags: [
            { programExerciseId: null, exerciseId: "ex-squat", kind: "skipped", reason: "pain" },
            { programExerciseId: null, exerciseId: "ex-bench", kind: "technique", note: "elbows flare" },
            { programExerciseId: null, exerciseId: "ex-unknown", kind: "pain" },
          ],
        }),
        flagged("c", "2026-11-03", { readiness: null, flags: null }),
      ],
      sets: [s("a", "ex-squat", 1, "100", 5, "8"), s("b", "ex-bench", 1, "80", 5), s("c", "ex-bench", 1, "80", 5)],
      catalog: logCatalog,
      sessionLabels,
    });
    expect(text).toBe(
      [
        "Flags: pain on Squat ×2 (2026-11-05 skipped, 2026-11-01 “knee twinge”); technique on Bench ×1 (2026-11-05 “elbows flare”)",
        "2026-11-05 Session 1 (Lower): Bench 80×5 | sleep 2/5 | skipped (pain) Squat; technique Bench “elbows flare”",
        "2026-11-03 Session 1 (Lower): Bench 80×5",
        "2026-11-01 Session 1 (Lower): Squat 100×5@8 | energy 6/10, sleep 2/5, soreness 4/5 | pain Squat “knee twinge”",
      ].join("\n")
    );
  });

  test("the default budget is an explicit named constant", () => {
    expect(HISTORY_TOKEN_BUDGET).toBeGreaterThanOrEqual(2000);
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });

  test("over budget: newest weeks stay verbatim, older weeks become per-lift best/total summaries", () => {
    const logs = [
      lifting("w3", "2026-11-05", "ps-1"), // week of 2026-11-02
      lifting("w2", "2026-10-28", "ps-1"), // week of 2026-10-26
      cardioLog("w2c", "2026-10-29", { modality: "Run", durationMin: 25, distanceKm: 4 }),
      lifting("w1a", "2026-10-19", "ps-1"), // week of 2026-10-19
      lifting("w1b", "2026-10-22", "ps-2"),
    ];
    const sets = [
      s("w3", "ex-squat", 1, "140", 5, "9"),
      s("w3", "ex-squat", 2, "140", 5, "9"),
      ...[1, 2, 3, 4, 5, 6].map((n) => s("w2", "ex-squat", n, "140", 5, "8.5")),
      s("w2", "ex-squat", 7, "137.5", 4, "9", "backoff"),
      s("w1a", "ex-squat", 1, "140", 5, "7"),
      s("w1a", "ex-squat", 2, "150", 3, "8"),
      s("w1a", "ex-plank", 1, "10", 45, "8"),
      s("w1b", "ex-bench", 1, "100", 5, "7"),
      s("w1b", "ex-bench", 2, "100", 5, "7"),
    ];
    const full = renderTrainingLog({ logs, sets, catalog: logCatalog, timedExerciseIds: new Set(["ex-plank"]), sessionLabels });
    const newest = "2026-11-05 Session 1 (Lower): Squat 140×5@9, 140×5@9";
    const expected = [
      newest,
      "Week of 2026-10-26 (summary): 1 lifting session, 1 cardio; Squat best 140×5@8.5, 7 sets, 4750 kg; cardio 25 min, 4 km",
      "Week of 2026-10-19 (summary): 2 lifting sessions; Squat best 150×3@8, 2 sets, 1150 kg; Plank best 10kg×45s@8, 1 set; Bench best 100×5@7, 2 sets, 1000 kg",
    ].join("\n");
    // Budget fits the newest week verbatim plus summaries of the older two — not more.
    const text = renderTrainingLog({
      logs,
      sets,
      catalog: logCatalog,
      timedExerciseIds: new Set(["ex-plank"]),
      sessionLabels,
      budgetTokens: estimateTokens(expected),
    });
    expect(full.split("\n")).toHaveLength(5);
    expect(text).toBe(expected);
  });

  test("when even summaries overflow, the oldest weeks are dropped with a note", () => {
    const logs = [lifting("n", "2026-11-05"), lifting("o", "2026-10-01")];
    const sets = [s("n", "ex-squat", 1, "140", 5, "9"), s("o", "ex-squat", 1, "120", 5, "7")];
    const newest = "2026-11-05 Freestyle: Squat 140×5@9";
    const text = renderTrainingLog({ logs, sets, catalog: logCatalog, budgetTokens: estimateTokens(newest) });
    expect(text).toBe([newest, "(1 older week omitted — over the context budget)"].join("\n"));
  });
});

test("session labels name each prescribed session by track and seq", () => {
  const labels = sessionLabelsFor([
    {
      sessions: [
        {
          sessions: [
            { id: "s1", kind: "lifting", seq: 1, name: "Lower A" },
            { id: "s2", kind: "lifting", seq: 2, name: "Session 2" },
            { id: "c1", kind: "cardio", seq: 1, name: "Easy run" },
          ],
        },
      ],
    },
  ]);
  expect([...labels]).toEqual([
    ["s1", "Session 1 (Lower A)"],
    ["s2", "Session 2"],
    ["c1", "Cardio 1 (Easy run)"],
  ]);
});
