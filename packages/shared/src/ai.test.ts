import { describe, expect, test } from "bun:test";
import {
  AiClientMessageDraft,
  ChatMessage,
  CLIENT_MESSAGE_MAX_CHARS,
  DEFAULT_GENERATION_SECONDS,
  KNOWN_PROVIDERS,
  AiProviderConfig,
  TYPICAL_GENERATION_SECONDS,
  draftNoticeText,
  mockChatReply,
  mockReviseDraft,
  typicalGenerationSeconds,
  AiGeneration,
  GenerationStatus,
  GENERATION_STATUSES,
  type AiProgramDraft,
} from "./index";

describe("KNOWN_PROVIDERS", () => {
  test("T1 KNOWN_PROVIDERS registers deepseek between zai and mock", () => {
    expect(Object.keys(KNOWN_PROVIDERS)).toEqual(["zai", "deepseek", "mock"]);
    const parsed = AiProviderConfig.parse(KNOWN_PROVIDERS.deepseek);
    expect(parsed.models[0]).toBe("deepseek-flash");
    expect(parsed.baseUrl).toBe("https://api.deepseek.com");
    expect(parsed.apiKeyEnvVar).toBe("DEEPSEEK_API_KEY");
    expect(parsed.maxOutputTokens).toBe(16384);
    expect(parsed.disableThinking).toBeUndefined();
  });

  test("T1b effort levels use one vocabulary, mock takes none", () => {
    const zai = AiProviderConfig.parse(KNOWN_PROVIDERS.zai);
    const deepseek = AiProviderConfig.parse(KNOWN_PROVIDERS.deepseek);
    const mock = AiProviderConfig.parse(KNOWN_PROVIDERS.mock);
    expect(zai.effortLevels).toEqual(["low", "high", "max"]);
    expect(zai.defaultEffort).toBe("low");
    expect(deepseek.effortLevels).toEqual(["low", "high", "max"]);
    expect(deepseek.defaultEffort).toBe("high");
    expect(mock.effortLevels).toBeUndefined();
    expect(mock.defaultEffort).toBeUndefined();
  });
});

describe("typicalGenerationSeconds", () => {
  test("T2 typicalGenerationSeconds knows deepseek", () => {
    expect(typicalGenerationSeconds("deepseek")).toBe(20);
    expect(typicalGenerationSeconds("zai")).toBe(210);
    expect(typicalGenerationSeconds("mock")).toBe(3);
    expect(typicalGenerationSeconds("unknown")).toBe(240);
  });

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

describe("GenerationStatus schema", () => {
  test("GenerationStatus accepts cancelled alongside existing statuses", () => {
    expect(GENERATION_STATUSES).toEqual([
      "pending",
      "validated",
      "failed_validation",
      "failed_provider",
      "approved",
      "rejected",
      "cancelled",
    ]);
    for (const status of GENERATION_STATUSES) {
      const res = GenerationStatus.safeParse(status);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe(status);
      }
    }
    expect(GenerationStatus.safeParse("unknown").success).toBe(false);
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

describe("ChatMessage schema, mockChatReply, draftNoticeText", () => {
  test("ChatMessage schema, mockChatReply, draftNoticeText", () => {
    const fixture = {
      id: "a0000000-0000-4000-8000-000000000001",
      trainerId: "b0000000-0000-4000-8000-000000000002",
      clientId: "c0000000-0000-4000-8000-000000000003",
      role: "trainer" as const,
      content: "How is Maya doing?",
      generationId: null,
      createdAt: "2026-10-31T05:00:00.000Z",
    };
    const parsed = ChatMessage.parse(fixture);
    expect(parsed.kind).toBe("chat");
    expect(parsed.role).toBe("trainer");

    const fullRow = {
      ...fixture,
      role: "assistant" as const,
      kind: "draft" as const,
      generationId: "d0000000-0000-4000-8000-000000000004",
    };
    expect(ChatMessage.parse(fullRow).kind).toBe("draft");

    expect(mockChatReply("hi", "Maya")).toBe(
      "(Maya) You asked: “hi” — mock reply. This client's profile, current program, recent logs, and latest draft are in the assistant's context; pick a live provider for real answers."
    );
    expect(mockChatReply("hi", null)).toBe(
      "(this client) You asked: “hi” — mock reply. This client's profile, current program, recent logs, and latest draft are in the assistant's context; pick a live provider for real answers."
    );

    const draftSample: AiProgramDraft = {
      name: "Strength Block A",
      rationale: "Rationale",
      clientSummary: "Summary",
      sessions: [
        { name: "Day 1", exercises: [] },
        { name: "Day 2", exercises: [] },
      ],
    };
    expect(draftNoticeText(draftSample)).toBe(
      "Draft ready: Strength Block A — 2 sessions. Open review to inspect and approve."
    );
  });
});
