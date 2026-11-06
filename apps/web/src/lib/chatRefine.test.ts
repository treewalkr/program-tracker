import { describe, expect, test } from "bun:test";
import {
  applyChatTurn,
  changedSessionIndexes,
  draftPreviewModel,
  submitChatTurn,
  type ChatTurnApi,
} from "./chatRefine";
import type { AiDraftDto, ChatMessageDto, GenerationDto, PrescribedSetDto } from "./api/types";
import { mockApi } from "./api/mock/api";

// ---- fixtures ----

const set = (reps: number, weightKg?: number): PrescribedSetDto =>
  weightKg === undefined
    ? { setNumber: 1, type: "working", reps, amrap: false }
    : { setNumber: 1, type: "working", reps, amrap: false, targetWeightKg: weightKg };

const catalogById = new Map([["ex-squat", { movementPattern: "squat" }]]);

let seq = 0;
function gen(overrides: Partial<GenerationDto> & { draft?: AiDraftDto | null } = {}): GenerationDto {
  const session = (name: string, reps = 5): AiDraftDto["sessions"][number] => ({
    name,
    exercises: [{ exerciseId: "ex-squat", exerciseName: "Back Squat", role: "primary", prescribedSets: [set(reps, 100)] }],
  });
  const { draft: draftOverride, ...rest } = overrides;
  const draft: AiDraftDto = {
    name: "Block 1",
    rationale: "r",
    clientSummary: "c",
    sessions: [session("A"), session("B"), session("C")],
    ...(draftOverride ?? {}),
  };
  seq += 1;
  return {
    id: `g-${seq}`,
    clientId: "c1",
    basedOnProgramId: null,
    kind: "block",
    targetWeek: null,
    providerId: "mock",
    model: "mock",
    status: "validated",
    draft,
    error: null,
    parentGenerationId: null,
    revisionMessage: null,
    instructions: null,
    rejectReason: null,
    approvedProgramId: null,
    exampleProgramIds: [],
    createdAt: new Date().toISOString(),
    ...rest,
  };
}

const msg = (id: string): ChatMessageDto => ({
  id,
  role: "trainer",
  kind: "chat",
  content: `m-${id}`,
  generationId: null,
  createdAt: new Date().toISOString(),
});

// ---- turn submission ----

describe("submitChatTurn", () => {
  test("a turn on a draft calls chatTurn once with the target and picker selection", async () => {
    const v1 = gen();
    const child = gen({ parentGenerationId: v1.id });
    const calls: unknown[] = [];
    const spy: ChatTurnApi = {
      async chatTurn(input) {
        calls.push(input);
        return { messages: [msg("r1")], generation: child };
      },
    };

    const result = await submitChatTurn(spy, {
      clientId: "c1",
      target: v1,
      message: "  pull week 3 volume back 20%  ",
      providerId: "deepseek",
      model: "deepseek-flash",
      effort: "max",
    });

    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({
      clientId: "c1",
      generationId: v1.id,
      message: "pull week 3 volume back 20%",
      providerId: "deepseek",
      model: "deepseek-flash",
      effort: "max",
    });
    expect(result.generation).toBe(child);
  });

  test("no target sends a null generationId; blank message never reaches the api", async () => {
    const v1 = gen();
    const calls: unknown[] = [];
    const spy: ChatTurnApi = {
      async chatTurn(input) {
        calls.push(input);
        return { messages: [msg("s1")], generation: null };
      },
    };

    const noTarget = await submitChatTurn(spy, { clientId: "c1", target: null, message: "how is squat?" });
    expect(calls[0]).toEqual({ clientId: "c1", generationId: null, message: "how is squat?" });
    expect(noTarget.generation).toBeNull();

    expect(submitChatTurn(spy, { clientId: "c1", target: v1, message: "   " })).rejects.toThrow(
      "message must not be empty"
    );
    expect(calls.length).toBe(1);
  });

  test(
    "one Send on a draft returns a proposal and builds no version (mock adapter)",
    async () => {
      const g = await mockApi.generate({ clientId: "cl-maya" });
      expect(g.status).toBe("validated");
      const gens = await mockApi.generations("cl-maya");

      const before = draftPreviewModel(gens, false, new Map());
      expect(before.target?.id).toBe(g.id);

      const res = await submitChatTurn(mockApi, {
        clientId: "cl-maya",
        target: before.target,
        message: "Cut accessories to 2 sets",
      });

      // Propose, don't build: no version churn until Build is pressed
      expect(res.generation).toBeNull();
      expect(res.messages[1].kind).toBe("proposal");
      const merged = applyChatTurn({ messages: [], gens }, res);
      const after = draftPreviewModel(merged.gens, false, new Map());
      expect(after.target?.id).toBe(g.id);
      expect(after.version).toBe(before.version);

      const stored = await mockApi.generations("cl-maya");
      expect(stored[0].id).toBe(gens[0].id);
    },
    15_000
  );
});

// ---- applyChatTurn ----

describe("applyChatTurn", () => {
  test("applyChatTurn appends rows and puts the new generation first without duplicates", () => {
    const v1 = gen();
    const child = gen({ parentGenerationId: v1.id });
    const prev = { messages: [msg("m1")], gens: [v1] };
    const result = { messages: [msg("m2"), msg("m3")], generation: child };

    const next = applyChatTurn(prev, result);
    expect(next.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(next.gens.map((g) => g.id)).toEqual([child.id, v1.id]);

    // Idempotent on the same generation — no duplicate entries
    const again = applyChatTurn(next, result);
    expect(again.gens).toHaveLength(2);
    expect(again.gens.map((g) => g.id)).toEqual([child.id, v1.id]);

    // An ask turn keeps the gens array (same reference)
    const askApplied = applyChatTurn(prev, { messages: [msg("m4")], generation: null });
    expect(askApplied.gens).toBe(prev.gens);
    expect(askApplied.messages.map((m) => m.id)).toEqual(["m1", "m4"]);

    // Inputs are not mutated
    expect(prev.messages.map((m) => m.id)).toEqual(["m1"]);
    expect(prev.gens.map((g) => g.id)).toEqual([v1.id]);
  });
});

// ---- draft preview model ----

describe("draftPreviewModel", () => {
  test("no validated draft yields an empty model", () => {
    expect(draftPreviewModel([], true, new Map())).toEqual({
      target: null,
      version: 0,
      generating: false,
      nextVersion: null,
      sessions: [],
    });
  });

  test("generating marks every session of the current draft as skeleton", () => {
    const v1 = gen();
    const model = draftPreviewModel([v1], true, catalogById);
    expect(model.generating).toBe(true);
    expect(model.nextVersion).toBe(2);
    expect(model.sessions.map((s) => s.state)).toEqual(["skeleton", "skeleton", "skeleton"]);
    expect(model.sessions[0].card.name).toBe("A");
  });

  test("after a revision the model shows the child as the next version", () => {
    const v1 = gen();
    const child = gen({ parentGenerationId: v1.id });
    const model = draftPreviewModel([child, v1], false, catalogById);
    expect(model.target?.id).toBe(child.id);
    expect(model.version).toBe(2);
    expect(model.generating).toBe(false);
    expect(model.nextVersion).toBeNull();
  });

  test("failed revision keeps the previous version in the preview", () => {
    const v1 = gen();
    const failed = gen({ parentGenerationId: v1.id, status: "failed_validation", draft: null });
    const model = draftPreviewModel([failed, v1], false, catalogById);
    expect(model.target?.id).toBe(v1.id);
    expect(model.version).toBe(1);
  });

  test("changed sessions are marked updated; others unchanged", () => {
    const v1 = gen();
    const childDraft: AiDraftDto = {
      ...v1.draft!,
      sessions: [
        v1.draft!.sessions[0],
        { ...v1.draft!.sessions[1], exercises: [{ exerciseId: "ex-squat", exerciseName: "Back Squat", role: "primary", prescribedSets: [set(3, 100)] }] },
        v1.draft!.sessions[2],
        { name: "D", exercises: [{ exerciseId: "ex-squat", exerciseName: "Back Squat", role: "primary", prescribedSets: [set(5, 100)] }] },
      ],
    };
    const child = gen({ parentGenerationId: v1.id, draft: childDraft });

    expect(changedSessionIndexes(v1.draft!, child.draft!)).toEqual([1, 3]);

    const model = draftPreviewModel([child, v1], false, catalogById);
    expect(model.sessions.map((s) => s.state)).toEqual(["unchanged", "updated", "unchanged", "updated"]);

    expect(changedSessionIndexes(null, child.draft!)).toEqual([]);
  });

  test("session cards are role-sorted with catalog movement patterns", () => {
    const draftSession: AiDraftDto["sessions"][number] = {
      exercises: [
        { exerciseId: "ex-x", role: "accessory", prescribedSets: [set(8)] },
        { exerciseId: "ex-squat", role: "primary", prescribedSets: [set(5, 100)] },
      ],
    };
    const v1 = gen({ draft: { sessions: [draftSession] } });
    const model = draftPreviewModel([v1], false, catalogById);
    const card = model.sessions[0].card;
    expect(card.exercises.map((e) => e.role)).toEqual(["primary", "accessory"]);
    expect(card.exercises[0].movementPattern).toBe("squat");
    expect(card.exercises[1].movementPattern).toBeNull();
    expect(card.kind).toBe("lifting");
  });

  test("unnamed exercises map to an empty display name", () => {
    const draftSession: AiDraftDto["sessions"][number] = {
      exercises: [{ prescribedSets: [set(5)] }],
    };
    const v1 = gen({ draft: { sessions: [draftSession] } });
    const model = draftPreviewModel([v1], false, catalogById);
    expect(model.sessions[0].card.exercises[0].name).toBe("");
  });
});
