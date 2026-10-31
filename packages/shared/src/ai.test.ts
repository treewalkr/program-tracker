import { describe, expect, test } from "bun:test";
import {
  AiClientMessageDraft,
  CLIENT_MESSAGE_MAX_CHARS,
  DEFAULT_GENERATION_SECONDS,
  TYPICAL_GENERATION_SECONDS,
  mockReviseDraft,
  typicalGenerationSeconds,
  AiGeneration,
  type AiProgramDraft,
} from "./index";

describe("typicalGenerationSeconds", () => {
  test("typicalGenerationSeconds returns configured providers and defaults unknowns", () => {
    expect(typicalGenerationSeconds("zai")).toBe(210);
    expect(typicalGenerationSeconds("mock")).toBe(3);
    expect(typicalGenerationSeconds("unknown")).toBe(240);
    expect(typicalGenerationSeconds("unknown")).toBe(DEFAULT_GENERATION_SECONDS);
    expect(TYPICAL_GENERATION_SECONDS.zai).toBe(210);
    expect(TYPICAL_GENERATION_SECONDS.mock).toBe(3);
  });
});

describe("mockReviseDraft", () => {
  test("mockReviseDraft clones, annotates rationale, leaves the original untouched", () => {
    const draft: AiProgramDraft = {
      name: "Block 1",
      rationale: "Original rationale",
      clientSummary: "Summary",
      sessions: [
        {
          name: "Day 1",
          exercises: [
            {
              exerciseName: "Squat",
              prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
            },
          ],
        },
      ],
    };
    const clonedBefore = structuredClone(draft);
    const revised = mockReviseDraft(draft, "swap bench for incline DB");

    expect(revised.rationale).toBe(`${draft.rationale}\n\nRevision: swap bench for incline DB`);
    expect(revised.sessions).toEqual(draft.sessions);
    expect(revised.name).toBe(draft.name);
    expect(revised.clientSummary).toBe(draft.clientSummary);
    expect(draft).toEqual(clonedBefore);
  });
});

describe("AiClientMessageDraft", () => {
  test("accepts a LINE-sized message and caps at CLIENT_MESSAGE_MAX_CHARS", () => {
    const ok = AiClientMessageDraft.safeParse({ message: "Great week — see you Monday." });
    expect(ok.success).toBe(true);

    const empty = AiClientMessageDraft.safeParse({ message: "" });
    expect(empty.success).toBe(false);

    const tooLong = AiClientMessageDraft.safeParse({ message: "x".repeat(CLIENT_MESSAGE_MAX_CHARS + 1) });
    expect(tooLong.success).toBe(false);
    const atLimit = AiClientMessageDraft.safeParse({ message: "x".repeat(CLIENT_MESSAGE_MAX_CHARS) });
    expect(atLimit.success).toBe(true);
  });
});

describe("AiGeneration schema", () => {
  test("AiGeneration row schema parses the new signal fields", () => {
    const fullRow = {
      id: "a0000000-0000-4000-8000-000000000001",
      trainerId: "b0000000-0000-4000-8000-000000000001",
      clientId: "c0000000-0000-4000-8000-000000000001",
      basedOnProgramId: null,
      kind: "block",
      targetWeek: null,
      direction: null,
      providerId: "mock",
      model: "mock-v1",
      status: "approved",
      draft: null,
      error: null,
      parentGenerationId: null,
      revisionMessage: "please change squat",
      instructions: "cap RPE at 8",
      rejectReason: null,
      approvedProgramId: "d0000000-0000-4000-8000-000000000001",
      createdAt: "2026-10-31T05:00:00.000Z",
    };

    const parsed = AiGeneration.parse(fullRow);
    expect(parsed.instructions).toBe("cap RPE at 8");
    expect(parsed.rejectReason).toBeNull();
    expect(parsed.approvedProgramId).toBe("d0000000-0000-4000-8000-000000000001");

    // null variants
    const nullRow = {
      ...fullRow,
      instructions: null,
      rejectReason: "too much volume",
      approvedProgramId: null,
    };
    const parsedNull = AiGeneration.parse(nullRow);
    expect(parsedNull.instructions).toBeNull();
    expect(parsedNull.rejectReason).toBe("too much volume");
    expect(parsedNull.approvedProgramId).toBeNull();
  });
});
