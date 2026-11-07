import { describe, expect, test } from "bun:test";
import type { GenerationDto } from "./api/types";
import {
  formatElapsed,
  generationPhase,
  isLivePending,
  latestValidatedDraft,
  progressFraction,
  revisionChain,
  typicalLabel,
} from "./generation";

function mockGen(partial: Partial<GenerationDto> = {}): GenerationDto {
  return {
    id: "gen-1",
    clientId: "client-1",
    basedOnProgramId: null,
    kind: "block",
    targetWeek: null,
    providerId: "zai",
    model: "glm-5.3-flash",
    status: "pending",
    draft: null,
    error: null,
    parentGenerationId: null,
  revisionMessage: null,
  instructions: null,
  rejectReason: null,
  approvedProgramId: null,
  exampleProgramIds: [],
  createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("generation helpers", () => {
  test("progressFraction scales with expected duration and caps at 90%", () => {
    expect(progressFraction(0, 210)).toBe(0);
    expect(progressFraction(105_000, 210)).toBe(0.5);
    expect(progressFraction(600_000, 210)).toBe(0.9);
    expect(progressFraction(100_000, 0)).toBe(0.9);
    expect(progressFraction(-5_000, 210)).toBe(0);
  });

  test("formatElapsed and typicalLabel format durations", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");

    expect(typicalLabel(45)).toBe("≈45s");
    expect(typicalLabel(210)).toBe("≈3.5 min");
    expect(typicalLabel(240)).toBe("≈4 min");
  });

  test("generationPhase resumes fresh pending, blocks stale pending", () => {
    const now = 1_700_000_000_000;
    const freshPending = mockGen({
      status: "pending",
      createdAt: new Date(now - 60_000).toISOString(),
    });
    expect(generationPhase(freshPending, now)).toBe("generating");

    const stalePending = mockGen({
      status: "pending",
      createdAt: new Date(now - 20 * 60_000).toISOString(),
    });
    expect(generationPhase(stalePending, now)).toBe("form");
  });

  test("generationPhase opens review for validated and failed panel for failures", () => {
    const validated = mockGen({ status: "validated" });
    expect(generationPhase(validated)).toBe("review");

    const failedProvider = mockGen({ status: "failed_provider", error: "network error" });
    expect(generationPhase(failedProvider)).toBe("failed");
  });

  test("generationPhase maps terminal statuses", () => {
    expect(generationPhase(null)).toBe("form");
    expect(generationPhase(undefined)).toBe("form");
    expect(generationPhase(mockGen({ status: "approved" }))).toBe("form");
    expect(generationPhase(mockGen({ status: "rejected" }))).toBe("form");
    expect(generationPhase(mockGen({ status: "cancelled" }))).toBe("form");
    expect(generationPhase(mockGen({ status: "failed_validation" }))).toBe("failed");
  });

  test("generationPhase maps cancelled to the form", () => {
    const now = 1_700_000_000_000;
    const freshCancelled = mockGen({
      status: "cancelled",
      createdAt: new Date(now - 1_000).toISOString(),
    });
    expect(generationPhase(freshCancelled, now)).toBe("form");
  });

  test("isLivePending ignores cancelled rows", () => {
    const now = 1_700_000_000_000;
    const freshCancelled = mockGen({
      status: "cancelled",
      createdAt: new Date(now - 1_000).toISOString(),
    });
    expect(isLivePending(freshCancelled, now)).toBe(false);
  });

  test("isLivePending flags only fresh pending rows", () => {
    const now = 1_700_000_000_000;
    const fresh = mockGen({
      status: "pending",
      createdAt: new Date(now - 60_000).toISOString(),
    });
    expect(isLivePending(fresh, now)).toBe(true);

    const stale = mockGen({
      status: "pending",
      createdAt: new Date(now - 20 * 60_000).toISOString(),
    });
    expect(isLivePending(stale, now)).toBe(false);

    expect(isLivePending(mockGen({ status: "validated" }), now)).toBe(false);
    expect(isLivePending(mockGen({ status: "rejected" }), now)).toBe(false);
    expect(isLivePending(null, now)).toBe(false);
  });
});

describe("revisionChain", () => {
  test("revisionChain walks parentGenerationId from root to current", () => {
    const root = mockGen({ id: "gen-1", parentGenerationId: null });
    const v2 = mockGen({ id: "gen-2", parentGenerationId: "gen-1", revisionMessage: "v2" });
    const v3 = mockGen({ id: "gen-3", parentGenerationId: "gen-2", revisionMessage: "v3" });
    const unrelated = mockGen({ id: "gen-other", parentGenerationId: null });

    const gens = [unrelated, v3, root, v2];

    // Linear chain root -> current; unrelated ignored
    expect(revisionChain(gens, "gen-3")).toEqual([root, v2, v3]);
    expect(revisionChain(gens, "gen-2")).toEqual([root, v2]);
    expect(revisionChain(gens, "gen-1")).toEqual([root]);

    // Unknown id -> []
    expect(revisionChain(gens, "unknown")).toEqual([]);
    expect(revisionChain(gens, "")).toEqual([]);

    // Missing parent stops the walk
    const orphan = mockGen({ id: "gen-orphan", parentGenerationId: "missing-parent" });
    expect(revisionChain([orphan], "gen-orphan")).toEqual([orphan]);
  });
});

describe("latestValidatedDraft", () => {
  test("latestValidatedDraft picks the newest validated row with a draft", () => {
    const draftObj: any = { name: "Draft", sessions: [] };
    const pending = mockGen({ id: "g-pending", status: "pending", draft: null });
    const validated1 = mockGen({ id: "g-val-1", status: "validated", draft: draftObj });
    const rejected = mockGen({ id: "g-rejected", status: "rejected", draft: draftObj });
    const validated2 = mockGen({ id: "g-val-2", status: "validated", draft: draftObj });
    const validatedNoDraft = mockGen({ id: "g-val-nodraft", status: "validated", draft: null });

    // newest-first: pending, validatedNoDraft, validated1, rejected, validated2
    expect(latestValidatedDraft([pending, validatedNoDraft, validated1, rejected, validated2])).toBe(validated1);

    // none validated with draft -> null
    expect(latestValidatedDraft([pending, rejected, validatedNoDraft])).toBeNull();
    expect(latestValidatedDraft([])).toBeNull();
  });
});
