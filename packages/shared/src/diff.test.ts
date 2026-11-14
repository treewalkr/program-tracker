import { describe, expect, test } from "bun:test";
import {
  diffRowsToText,
  groupedSetsOf,
  diffSources,
  aiDraftToDiffSource,
  programWeeksToDiffSource,
  type DiffRow,
  type AiProgramDraft,
  draftFromSessions,
  type ProgramWeek,
} from "./index";

describe("diffRowsToText", () => {
  test("diffRowsToText renders only changed rows", () => {
    const rows: DiffRow[] = [
      { exercise: "Squat", change: "changed", detail: "5/5 → 4/5" },
      { exercise: "Leg Press", change: "kept", detail: "10/10" },
      { exercise: "Row", change: "added", detail: "new — 3/3" },
      { exercise: "Bench Press", change: "removed", detail: "was 5/5 (Day A)" },
    ];

    expect(diffRowsToText(rows)).toBe(
      "- changed Squat: 5/5 → 4/5\n- added Row: new — 3/3\n- removed Bench Press: was 5/5 (Day A)"
    );
    expect(diffRowsToText([])).toBe("");
    expect(diffRowsToText([{ exercise: "Squat", change: "kept", detail: "5/5" }])).toBe("");
  });
});

describe("aiDraftToDiffSource and programWeeksToDiffSource", () => {
  test("aiDraftToDiffSource and programWeeksToDiffSource project domain shapes", () => {
    const draft: AiProgramDraft = draftFromSessions({
      name: "Draft 1",
      rationale: "Rationale",
      clientSummary: "Summary",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [
            {
              exerciseName: "Squat",
              prescribedSets: [
                { setNumber: 1, type: "working", reps: 5, amrap: false },
                { setNumber: 2, type: "working", reps: 5, amrap: true },
              ],
            },
            {
              exerciseId: "b0000000-0000-4000-8000-000000000001",
              prescribedSets: [{ setNumber: 1, type: "working", reps: 8, amrap: false }],
            },
          ],
        },
      ],
    });

    const draftSource = aiDraftToDiffSource(draft);
    expect(draftSource).toEqual({
      sessions: [
        {
          name: "Day 1",
          exercises: [
            { name: "Squat", sets: "5/5+" },
            { name: "b0000000-0000-4000-8000-000000000001", sets: "8" },
          ],
        },
      ],
    });

    const weeks: ProgramWeek[] = [
      {
        week: 1,
        sessions: [
              {
                id: "s1",
                name: "Week 1 Day 1",
                seq: 1,
                order: 0,
                kind: "lifting",
                exercises: [
                  {
                    id: "e1",
                    exerciseId: "a0000000-0000-4000-8000-000000000001",
                    exerciseName: "Old Squat",
                    order: 0,
                    prescribedSets: [{ setNumber: 1, type: "working", reps: 10, amrap: false }],
                  },
                ],
              },
            ],
      },
      {
        week: 2,
        sessions: [
              {
                id: "s2",
                name: "Week 2 Day 1",
                seq: 1,
                order: 0,
                kind: "lifting",
                exercises: [
                  {
                    id: "e2",
                    exerciseId: "a0000000-0000-4000-8000-000000000001",
                    exerciseName: "Squat",
                    order: 0,
                    prescribedSets: [
                      { setNumber: 1, type: "working", reps: 5, amrap: false },
                      { setNumber: 2, type: "working", reps: 5, amrap: true },
                    ],
                  },
                  {
                    id: "e3",
                    exerciseId: "b0000000-0000-4000-8000-000000000002",
                    order: 1,
                    prescribedSets: [{ setNumber: 1, type: "working", reps: 12, amrap: false }],
                  },
                ],
              },
            ],
      },
    ];

    // default picks latest week (week 2)
    const weekSource = programWeeksToDiffSource(weeks);
    expect(weekSource).toEqual({
      sessions: [
        {
          name: "Week 2 Day 1",
          weekday: null,
          exercises: [
            { name: "Squat", sets: "5/5+" },
            { name: "b0000000-0000-4000-8000-000000000002", sets: "12" },
          ],
        },
      ],
    });

    // explicit week 1
    const week1Source = programWeeksToDiffSource(weeks, 1);
    expect(week1Source).toEqual({
      sessions: [
        {
          name: "Week 1 Day 1",
          weekday: null,
          exercises: [{ name: "Old Squat", sets: "10" }],
        },
      ],
    });
  });
});

describe("diffSources sees moved sessions", () => {
  const src = (weekday: number | null | undefined, name = "Day 1") => ({
    sessions: [{ name, ...(weekday !== undefined ? { weekday } : {}), exercises: [{ name: "Squat", sets: "5/5" }] }],
  });

  test("a session moved to another weekday is a change", () => {
    expect(diffSources(src(1), src(3))).toContainEqual({ exercise: "Day 1", change: "changed", detail: "session moved Mon → Wed" });
  });

  test("unscheduling a session is a change", () => {
    expect(diffSources(src(2), src(null))).toContainEqual({ exercise: "Day 1", change: "changed", detail: "session moved Tue → unscheduled" });
  });

  test("no weekday suggestion on one side is not a move", () => {
    expect(diffSources(src(undefined), src(3)).filter((r) => r.change !== "kept")).toEqual([]);
    expect(diffSources(src(4), src(4)).filter((r) => r.change !== "kept")).toEqual([]);
  });

  test("sources carry weekdays: AI suggestions when given, program placement always", () => {
    const draft = { name: "D", rationale: "", clientSummary: "", weeks: [{ week: 1, sessions: [{ name: "A", kind: "lifting", weekday: 5, exercises: [] }, { name: "B", kind: "lifting", weekday: null, exercises: [] }] }] } as unknown as AiProgramDraft;
    expect(aiDraftToDiffSource(draft).sessions.map((s) => s.weekday)).toEqual([5, undefined]);
    const weeks = [{ week: 1, sessions: [{ id: "s", name: "A", seq: 1, order: 0, kind: "lifting", exercises: [] }] }] as unknown as ProgramWeek[];
    expect(programWeeksToDiffSource(weeks).sessions[0].weekday).toBeNull();
  });
});

describe("groups in diffs", () => {
  test("joining a superset shows as a change", () => {
    const s = (n: number) => ({ reps: 8, amrap: false, setNumber: n });
    const list = [
      { prescribedSets: [s(1), s(2)], group: "A" },
      { prescribedSets: [s(1), s(2)], group: "A" },
      { prescribedSets: [s(1), s(2)] },
    ];
    expect([0, 1, 2].map((i) => groupedSetsOf(list, i))).toEqual(["8/8 · A1", "8/8 · A2", "8/8"]);
  });
});
