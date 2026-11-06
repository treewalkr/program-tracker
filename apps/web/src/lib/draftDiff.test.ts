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

  test("programToDiffSource picks the requested week; default stays latest", () => {
    const program: any = {
      weeks: [
        {
          week: 1,
          sessions: [
            {
              id: "s1",
              seq: 1,
              name: "Week 1 Day 1",
              exercises: [{ exerciseName: "Squat", prescribedSets: [{ reps: 5, amrap: false }] }],
            },
          ],
        },
        {
          week: 2,
          sessions: [
            {
              id: "s2",
              seq: 1,
              name: "Week 2 Day 1",
              exercises: [{ exerciseName: "Deadlift", prescribedSets: [{ reps: 3, amrap: false }] }],
            },
          ],
        },
        {
          week: 3,
          sessions: [
            {
              id: "s3",
              seq: 1,
              name: "Week 3 Day 1",
              exercises: [{ exerciseName: "Bench", prescribedSets: [{ reps: 8, amrap: false }] }],
            },
          ],
        },
      ],
    };
    // No arg -> latest week (week 3)
    const latest = programToDiffSource(program);
    expect(latest.sessions).toHaveLength(1);
    expect(latest.sessions[0].name).toBe("Week 3 Day 1");
    expect(latest.sessions[0].exercises[0].name).toBe("Bench");

    // Explicit week 2 -> week 2's sessions
    const week2 = programToDiffSource(program, 2);
    expect(week2.sessions).toHaveLength(1);
    expect(week2.sessions[0].name).toBe("Week 2 Day 1");
    expect(week2.sessions[0].exercises[0].name).toBe("Deadlift");
  });
});
