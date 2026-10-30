import { describe, expect, test } from "bun:test";
import { diffSources, programToDiffSource, type DiffSource, type DiffRow } from "./draftDiff";

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

  test("programToDiffSource flattens the latest week", () => {
    const program: any = {
      weeks: [
        {
          week: 1,
          days: [
            {
              id: "d1",
              sessions: [
                {
                  id: "s1",
                  name: "Week 1 Day 1",
                  exercises: [{ exerciseName: "Squat", prescribedSets: [{ reps: 5, amrap: false }] }],
                },
              ],
            },
          ],
        },
        {
          week: 2,
          days: [
            {
              id: "d2",
              sessions: [
                {
                  id: "s2",
                  name: "Week 2 Day 1",
                  exercises: [{ exerciseName: "Deadlift", prescribedSets: [{ reps: 3, amrap: false }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const source = programToDiffSource(program);
    expect(source.sessions).toHaveLength(1);
    expect(source.sessions[0].name).toBe("Week 2 Day 1");
    expect(source.sessions[0].exercises[0].name).toBe("Deadlift");
  });
});
