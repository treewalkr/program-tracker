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

  it("selectExamples ranks by goal overlap then days proximity, drops zero-score and excluded", () => {
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
      level: "beginner",
      daysPerWeek: 3, // ±1 to 4 -> score 1
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
      title: "exact days only",
      goal: "gymnastics floor work",
      level: "intermediate",
      daysPerWeek: 4, // exact days -> score 2
      createdAt: "2026-10-05T00:00:00Z",
    };

    const pool = [exExactAndWords, exDaysProxOnly, exZeroScore, exExcluded, exThirdValid];

    const results = selectExamples(
      pool,
      { goals: "Lean bulk to 85kg", daysPerWeek: 4 },
      { excludeProgramId: "prog-4", limit: 2 }
    );

    // prog-1: goal shared words ("lean", "bulk") = 2*2=4 + days 4 vs 4 (+2) = 6
    // prog-5: days 4 vs 4 (+2) = 2
    // prog-2: days 3 vs 4 (+1) = 1
    // prog-3: 0
    // prog-4: excluded
    // limit 2 caps to [prog-1, prog-5]
    expect(results.length).toBe(2);
    expect(results[0]?.programId).toBe("prog-1");
    expect(results[1]?.programId).toBe("prog-5");

    // Equal score keeps input order
    const tieA: TestItem = {
      programId: "tie-a",
      title: "tie A",
      goal: "powerlifting",
      level: "advanced",
      daysPerWeek: 3,
      createdAt: "2026-10-01",
    };
    const tieB: TestItem = {
      programId: "tie-b",
      title: "tie B",
      goal: "weightlifting",
      level: "advanced",
      daysPerWeek: 3,
      createdAt: "2026-10-02",
    };

    const ties = selectExamples([tieA, tieB], { goals: "yoga", daysPerWeek: 4 });
    expect(ties.length).toBe(2);
    expect(ties[0]?.programId).toBe("tie-a");
    expect(ties[1]?.programId).toBe("tie-b");
  });
});
