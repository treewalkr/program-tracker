import { describe, expect, test } from "bun:test";
import { diffSources, type DiffSource, type DiffRow } from "./draftDiff";

describe("diffSources", () => {
  test("diffSources marks added, removed, changed, kept with stable details", () => {
    const before: DiffSource = {
      sessions: [
        {
          name: "Day 1",
          exercises: [
            { name: "Back Squat", sets: "5/5" },
            { name: "Bench Press", sets: "5/5" },
            { name: "Deadlift", sets: "5" },
          ],
        },
      ],
    };

    const after: DiffSource = {
      sessions: [
        {
          name: "Day A",
          exercises: [
            { name: "Back Squat", sets: "5/5" },
            { name: "Bench Press", sets: "6/6" },
            { name: "Overhead Press", sets: "8/8" },
          ],
        },
      ],
    };

    const expected: DiffRow[] = [
      { exercise: "Back Squat", change: "kept", detail: "5/5" },
      { exercise: "Bench Press", change: "changed", detail: "5/5 → 6/6" },
      { exercise: "Overhead Press", change: "added", detail: "new — 8/8" },
      { exercise: "Deadlift", change: "removed", detail: "was 5 (Day 1)" },
    ];

    expect(diffSources(before, after)).toEqual(expected);
  });

  test("diffSources returns empty array when before or after is null", () => {
    expect(diffSources(null, null)).toEqual([]);
    expect(diffSources({ sessions: [] }, null)).toEqual([]);
    expect(diffSources(null, { sessions: [] })).toEqual([]);
  });
});
