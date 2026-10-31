import { describe, expect, test } from "bun:test";
import { toReuseInput } from "./examples";
import type { ProgramExampleDto } from "./api/types";
import type { ProgramWeek } from "@pt/shared";

const weeks: ProgramWeek[] = [
  {
    week: 1,
    days: [
      {
        id: "day-1",
        day: 1,
        weekday: 1,
        sessions: [
          {
            id: "sess-1",
            name: "Day A",
            order: 0,
            kind: "lifting",
            exercises: [
              {
                id: "pex-1",
                exerciseId: "ex-squat",
                order: 0,
                prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 }],
              },
            ],
          },
        ],
      },
    ],
  },
];

const example: ProgramExampleDto = {
  id: "ex-1",
  programId: "pg-source",
  goal: "lean bulk",
  level: "intermediate",
  daysPerWeek: 4,
  note: null,
  createdAt: "2026-10-20T09:00:00Z",
  program: {
    id: "pg-source",
    clientId: "cl-source",
    name: "Gold Standard Block",
    description: "Built for the source client's numbers.",
    status: "active",
    version: 3,
    aiAssisted: false,
    createdFromProgramId: null,
    weeks,
    createdAt: "2026-08-01T09:00:00Z",
    activatedAt: null,
    phasing: { plannedWeeks: 4, phase: "hypertrophy", nextPhase: "deload", weeks: [{ week: 1, directive: "base" }] },
  },
};

describe("toReuseInput", () => {
  test("copies name, phasing and provenance, clones weeks, clears description", () => {
    const input = toReuseInput(example, "cl-maya");

    expect(input.clientId).toBe("cl-maya");
    expect(input.name).toBe("Gold Standard Block");
    expect(input.description).toBe(null);
    expect(input.phasing).toEqual(example.program.phasing);
    expect(input.createdFromProgramId).toBe("pg-source");

    // cloned weeks: fresh ids, same structure and catalog refs
    const src = example.program.weeks[0].days[0];
    const dst = input.weeks[0].days[0];
    expect(dst.id).not.toBe(src.id);
    expect(dst.sessions[0].id).not.toBe(src.sessions[0].id);
    expect(dst.sessions[0].exercises[0].id).not.toBe(src.sessions[0].exercises[0].id);
    expect(dst.sessions[0].exercises[0].exerciseId).toBe("ex-squat");
    expect(dst.weekday).toBe(src.weekday);
    expect(input.weeks[0].week).toBe(1);
    expect(dst.sessions[0].exercises[0].prescribedSets).toEqual(
      src.sessions[0].exercises[0].prescribedSets
    );

    // source untouched
    expect(example.program.weeks[0].days[0].id).toBe("day-1");
  });

  test("missing phasing reuses as null", () => {
    const bare: ProgramExampleDto = {
      ...example,
      program: { ...example.program, phasing: null },
    };
    expect(toReuseInput(bare, "cl-x").phasing).toBe(null);
  });
});
