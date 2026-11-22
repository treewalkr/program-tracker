import { describe, expect, test } from "bun:test";
import type { AiProgramDraft } from "@pt/shared";
import { blockEvalCell, evalBlocks } from "./lib/eval-blocks";

const sets = (n: number) => Array.from({ length: n }, (_, i) => ({ setNumber: i + 1, type: "working" as const, reps: 5, amrap: false }));
const ex = (exerciseName: string, role: string, block?: "prep") => ({ exerciseName, role, prescribedSets: sets(2), ...(block ? { block } : {}) });

describe("evalBlocks", () => {
  test("counts prep apart, checks one Primary in main, lists the spot-check", () => {
    const draft = {
      name: "B",
      rationale: "",
      clientSummary: "",
      weeks: [
        {
          week: 1,
          sessions: [
            { name: "Lower", kind: "exercises", exercises: [ex("Hip CARs", "mobility", "prep"), ex("Squat jump", "primary", "prep"), ex("Back Squat", "primary")] },
            { name: "Upper", kind: "exercises", exercises: [ex("Bench", "strength")] },
            { name: "Run", kind: "cardio", exercises: [] },
          ],
        },
      ],
    } as unknown as AiProgramDraft;
    const b = evalBlocks(draft);
    expect(b).toMatchObject({ withPrep: 1, sessions: 2, prepItems: 2, prepSets: 4, primaryOff: ["W1 Upper (0)"], primaryInPrep: ["W1 Lower"], ruleBroken: [] });
    expect(b.spotCheck).toEqual(["W1 Lower: Hip CARs, Squat jump → Back Squat"]);
    expect(blockEvalCell(b)).toBe("1/2 sessions · 2 items · 1 Primary off · 1 Primary in prep");
  });
});
