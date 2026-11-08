import { describe, expect, it } from "bun:test";
import {
  ProgramExampleInput,
  ProgramExamplePatch,
  selectExamples,
  type ExampleRetrievalTags,
} from "./examples";

describe("examples", () => {
  it("ProgramExampleInput rejects blank goal, bad level, days 8; patch accepts note null", () => {
    const validMinimal = {
      programId: crypto.randomUUID(),
      goal: "strength and hypertrophy",
      level: "intermediate" as const,
    };
    expect(ProgramExampleInput.safeParse(validMinimal).success).toBe(true);

    const blankGoal = { ...validMinimal, goal: "" };
    expect(ProgramExampleInput.safeParse(blankGoal).success).toBe(false);

    const badLevel = { ...validMinimal, level: "superhuman" };
    expect(ProgramExampleInput.safeParse(badLevel).success).toBe(false);

    const days8 = { ...validMinimal, daysPerWeek: 8 };
    expect(ProgramExampleInput.safeParse(days8).success).toBe(false);

    // Patch schema checks
    const patchNoteNull = ProgramExamplePatch.safeParse({ note: null });
    expect(patchNoteNull.success).toBe(true);
    if (patchNoteNull.success) {
      expect(patchNoteNull.data.note).toBeNull();
    }

    const patchBlankGoal = ProgramExamplePatch.safeParse({ goal: "" });
    expect(patchBlankGoal.success).toBe(false);

    const patchUntouched = ProgramExamplePatch.safeParse({});
    expect(patchUntouched.success).toBe(true);
  });

  it("selectExamples ranks by goal overlap then days proximity, drops no-goal-match and excluded", () => {
    interface TestItem extends ExampleRetrievalTags {
      programId: string;
      title: string;
    }

    const exExactAndWords: TestItem = {
      programId: "prog-1",
      title: "exact match",
      goal: "lean bulk hypertrophy with pull-up focus",
      level: "intermediate",
      daysPerWeek: 4,
      createdAt: "2026-10-01T00:00:00Z",
    };

    const exDaysProxOnly: TestItem = {
      programId: "prog-2",
      title: "prox days only",
      goal: "marathon running stamina",
      level: "intermediate",
      daysPerWeek: 3, // ±1 to 4, but no shared goal word -> dropped
      createdAt: "2026-10-02T00:00:00Z",
    };

    const exZeroScore: TestItem = {
      programId: "prog-3",
      title: "zero score",
      goal: "swimming aerobic base",
      level: "advanced",
      daysPerWeek: 1, // diff 3 -> score 0
      createdAt: "2026-10-03T00:00:00Z",
    };

    const exExcluded: TestItem = {
      programId: "prog-4",
      title: "excluded",
      goal: "lean bulk hypertrophy",
      level: "intermediate",
      daysPerWeek: 4,
      createdAt: "2026-10-04T00:00:00Z",
    };

    const exThirdValid: TestItem = {
      programId: "prog-5",
      title: "one word + exact days",
      goal: "bulk for gymnastics",
      level: "intermediate",
      daysPerWeek: 4, // "bulk" (+2) + exact days (+2) -> score 4
      createdAt: "2026-10-05T00:00:00Z",
    };

    const pool = [exExactAndWords, exDaysProxOnly, exZeroScore, exExcluded, exThirdValid];

    const results = selectExamples(
      pool,
      { goals: "Lean bulk to 85kg", daysPerWeek: 4 },
      { excludeProgramId: "prog-4", limit: 2 }
    );

    // prog-1: goal shared words ("lean", "bulk") = 2*2=4 + days 4 vs 4 (+2) = 6
    // prog-5: "bulk" (+2) + days 4 vs 4 (+2) = 4
    // prog-2: days ±1 only, no goal word -> not eligible
    // prog-3: no goal word -> not eligible
    // prog-4: excluded
    expect(results.length).toBe(2);
    expect(results[0]?.programId).toBe("prog-1");
    expect(results[1]?.programId).toBe("prog-5");

    const capped = selectExamples(pool, { goals: "Lean bulk to 85kg", daysPerWeek: 4 }, { limit: 1 });
    expect(capped.map((r) => r.programId)).toEqual(["prog-1"]);

    // Equal score keeps input order
    const tieA: TestItem = {
      programId: "tie-a",
      title: "tie A",
      goal: "powerlifting peaking",
      level: "advanced",
      daysPerWeek: 3,
      createdAt: "2026-10-01",
    };
    const tieB: TestItem = {
      programId: "tie-b",
      title: "tie B",
      goal: "powerlifting base",
      level: "advanced",
      daysPerWeek: 3,
      createdAt: "2026-10-02",
    };

    const ties = selectExamples([tieA, tieB], { goals: "powerlifting", daysPerWeek: 4 });
    expect(ties.length).toBe(2);
    expect(ties[0]?.programId).toBe("tie-a");
    expect(ties[1]?.programId).toBe("tie-b");
  });
});

describe("selectExamples matching rules (F24)", () => {
  interface Ex extends ExampleRetrievalTags {
    programId: string;
  }
  const ex = (programId: string, goal: string, level: Ex["level"], daysPerWeek: number | null): Ex => ({
    programId,
    goal,
    level,
    daysPerWeek,
    createdAt: "2026-10-01T00:00:00Z",
  });

  it("does not feed an advanced powerlifting example to a novice hypertrophy client", () => {
    const powerlifting = ex("pl", "Powerlifting meet prep", "advanced", 4);
    const picked = selectExamples([powerlifting], {
      goals: "Novice hypertrophy — build muscle",
      level: "beginner",
      daysPerWeek: 3,
    });
    expect(picked).toEqual([]);
  });

  it("never selects an example on days/week alone", () => {
    const exactDays = ex("exact", "gymnastics floor work", "intermediate", 4);
    const nearDays = ex("near", "marathon running stamina", "intermediate", 3);
    expect(
      selectExamples([exactDays, nearDays], { goals: "lean bulk", level: "intermediate", daysPerWeek: 4 })
    ).toEqual([]);
  });

  it("selects nothing when the client has no goals", () => {
    const e = ex("e", "lean bulk", "intermediate", 4);
    expect(selectExamples([e], { goals: null, level: "intermediate", daysPerWeek: 4 })).toEqual([]);
    expect(selectExamples([e], { goals: "  ", level: "intermediate", daysPerWeek: 4 })).toEqual([]);
  });

  it("ignores stopwords when matching goals", () => {
    const e = ex("e", "mobility and balance", null, null);
    expect(selectExamples([e], { goals: "strength and power" })).toEqual([]);
    const filler = ex("f", "build a general training program for the summer", null, null);
    expect(selectExamples([filler], { goals: "improve general training program with focus" })).toEqual([]);
  });

  it("keeps strength and muscle as meaningful goal words", () => {
    const strength = ex("s", "Strength block", null, null);
    const muscle = ex("m", "Add muscle", null, null);
    expect(selectExamples([strength], { goals: "get stronger — strength focus" }).map((x) => x.programId)).toEqual(["s"]);
    expect(selectExamples([muscle], { goals: "build muscle" }).map((x) => x.programId)).toEqual(["m"]);
  });

  it("ranks the same level above an adjacent level when goal and days tie", () => {
    const adjacent = ex("adjacent", "hypertrophy block", "advanced", 4);
    const same = ex("same", "hypertrophy block", "intermediate", 4);
    const picked = selectExamples([adjacent, same], {
      goals: "hypertrophy",
      level: "intermediate",
      daysPerWeek: 4,
    });
    expect(picked.map((x) => x.programId)).toEqual(["same", "adjacent"]);
  });

  it("excludes beginner vs advanced even when the goal overlaps", () => {
    const advanced = ex("adv", "hypertrophy block", "advanced", 3);
    const beginner = ex("beg", "hypertrophy block", "beginner", 3);
    expect(selectExamples([advanced], { goals: "hypertrophy", level: "beginner", daysPerWeek: 3 })).toEqual([]);
    expect(selectExamples([beginner], { goals: "hypertrophy", level: "advanced", daysPerWeek: 3 })).toEqual([]);
  });

  it("treats a missing level on either side as neutral", () => {
    const untagged = ex("untagged", "hypertrophy block", null, 4);
    const tagged = ex("tagged", "hypertrophy block", "advanced", 4);
    // client without a level: the advanced example is not excluded and ties the untagged one
    expect(
      selectExamples([untagged, tagged], { goals: "hypertrophy", level: null, daysPerWeek: 4 }).map((x) => x.programId)
    ).toEqual(["untagged", "tagged"]);
    // example without a level vs a beginner client: kept, scores no level bonus
    expect(
      selectExamples([untagged], { goals: "hypertrophy", level: "beginner", daysPerWeek: 4 }).map((x) => x.programId)
    ).toEqual(["untagged"]);
  });
});
