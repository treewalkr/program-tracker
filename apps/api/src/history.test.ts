import { expect, test } from "bun:test";
import type { SessionLogRow, SetLogRow } from "@pt/db";
import { buildHistory } from "./lib/history";

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
