import { describe, expect, test } from "bun:test";
import { extractJsonObject } from "./ai/provider";
import { buildGenerationMessages } from "./ai/prompt";
import { bindPendingExercises, draftToSessions } from "./lib/draftToProgram";
import type { AiProgramDraft } from "@pt/shared";

describe("extractJsonObject", () => {
  test("passes through clean JSON", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  test("unwraps fenced JSON", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("extracts from surrounding prose", () => {
    expect(extractJsonObject('Here you go: {"a": {"b": 2}} — hope it helps!')).toBe('{"a": {"b": 2}}');
  });
});

describe("buildGenerationMessages", () => {
  test("limitations reach the prompt verbatim (safety)", () => {
    const { system, user } = buildGenerationMessages({
      client: { name: "Ada", goals: "get strong", limitations: "Left knee pain — no deep knee flexion", daysPerWeek: 3 },
      previousProgram: null,
      history: [],
      catalog: [],
      trainerInstructions: "",
    });
    expect(system).toContain("hard constraint");
    expect(user).toContain("Left knee pain");
    expect(user).toContain("Ada");
    expect(system).toContain("days per week (3)");
  });

  test("history numbers are included for progression reasoning", () => {
    const { user } = buildGenerationMessages({
      client: { name: "Bob" },
      previousProgram: null,
      history: [{ exerciseName: "Back Squat", recentSets: ["100kg × 5 @ RPE 8"], bestE1rm: 116.7 }],
      catalog: [],
      trainerInstructions: "",
    });
    expect(user).toContain("100kg × 5 @ RPE 8");
    expect(user).toContain("116.7");
  });
});

const draft: AiProgramDraft = {
  name: "Block 2",
  rationale: "hold volume, add load",
  clientSummary: "same split, heavier",
  sessions: [
    {
      name: "Day A",
      exercises: [
        { exerciseId: "11111111-1111-1111-1111-111111111111", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] },
        { exerciseName: "Cable Crunch", prescribedSets: [{ setNumber: 1, reps: 12, type: "working", amrap: false }] },
      ],
    },
  ],
};

const catalog = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Back Squat" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Bench Press" },
];

describe("draftToSessions", () => {
  test("resolves by id, by name-match, and flags creates", () => {
    const { sessions, createdNames, unresolvable } = draftToSessions(draft, catalog);
    expect(unresolvable).toEqual([]);
    expect(createdNames).toEqual(["Cable Crunch"]); // not in catalog → create
    expect(sessions[0].exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
    expect(sessions[0].exercises[1].exerciseId).toBe("pending:cable crunch");
  });

  test("name refs that exactly match the catalog reuse the catalog id", () => {
    const d2 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseName: "back squat", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] }] }] };
    const { createdNames, sessions } = draftToSessions(d2, catalog);
    expect(createdNames).toEqual([]);
    expect(sessions[0].exercises[0].exerciseId).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("bogus id without name is unresolvable, not silently dropped", () => {
    const d3 = { ...draft, sessions: [{ ...draft.sessions[0], exercises: [{ exerciseId: "99999999-9999-9999-9999-999999999999", prescribedSets: [{ setNumber: 1, reps: 5, type: "working", amrap: false }] }] }] };
    const { unresolvable } = draftToSessions(d3, catalog);
    expect(unresolvable).toEqual(["99999999-9999-9999-9999-999999999999"]);
  });
});

describe("bindPendingExercises", () => {
  test("replaces pending ids with real ones", () => {
    const { sessions } = draftToSessions(draft, catalog);
    const bound = bindPendingExercises(sessions, new Map([["cable crunch", "33333333-3333-3333-3333-333333333333"]]));
    expect(bound[0].exercises[1].exerciseId).toBe("33333333-3333-3333-3333-333333333333");
  });

  test("throws on a name that never got an id (programming error)", () => {
    const { sessions } = draftToSessions(draft, catalog);
    expect(() => bindPendingExercises(sessions, new Map())).toThrow(/cable crunch/);
  });
});
