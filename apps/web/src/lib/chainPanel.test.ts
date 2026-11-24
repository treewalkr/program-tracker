import { describe, expect, test } from "bun:test";
import { chainPanel } from "./chainPanel";

const cw = (sets: number[]) => ({
  weekStart: "2026-11-23",
  chains: [
    { id: "a", name: "Front", muscleGroups: ["quads"], sets: sets[0] },
    { id: "b", name: "Back", muscleGroups: ["hamstrings"], sets: sets[1] },
  ],
});
const catalog = [
  { id: "squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: [] },
  { id: "rdl", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [] },
];
const log = (date: string, ids: string[]) => ({ date, sets: ids.map((exerciseId) => ({ exerciseId, type: "working" })) });

describe("chainPanel", () => {
  test("this week has sets: show it as is", () => {
    const v = chainPanel(cw([3, 0]), [log("2026-11-17", ["rdl"])], catalog);
    expect(v.week).toBe("this");
    expect(v.weekStart).toBe("2026-11-23");
    expect(v.chains.map((c) => c.sets)).toEqual([3, 0]);
  });

  test("an empty week so far falls back to last week's sets", () => {
    const logs = [log("2026-11-16", ["squat", "rdl"]), log("2026-11-20", ["rdl"]), log("2026-11-09", ["squat"])];
    const v = chainPanel(cw([0, 0]), logs, catalog);
    expect(v.week).toBe("last");
    expect(v.weekStart).toBe("2026-11-16");
    expect(v.chains.map((c) => c.sets)).toEqual([1, 2]);
  });

  test("nothing last week either: stay on this week", () => {
    const v = chainPanel(cw([0, 0]), [log("2026-11-09", ["squat"])], catalog);
    expect(v.week).toBe("this");
    expect(v.chains.map((c) => c.sets)).toEqual([0, 0]);
  });

  test("week start crosses a month and year", () => {
    const v = chainPanel({ ...cw([0, 0]), weekStart: "2027-01-04" }, [log("2026-12-28", ["squat"])], catalog);
    expect(v.weekStart).toBe("2026-12-28");
    expect(v.chains[0].sets).toBe(1);
  });
});
