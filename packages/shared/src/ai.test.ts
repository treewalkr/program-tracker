import { describe, expect, test } from "bun:test";
import {
  AiClientMessageDraft,
  CLIENT_MESSAGE_MAX_CHARS,
  DEFAULT_GENERATION_SECONDS,
  TYPICAL_GENERATION_SECONDS,
  mockReviseDraft,
  typicalGenerationSeconds,
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
          kind: "lifting",
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
