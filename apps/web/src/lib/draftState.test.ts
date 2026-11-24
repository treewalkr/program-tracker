import { describe, expect, test } from "bun:test";
import type { AiDraftDto, GenerationDto, ProgramDto } from "./api/types";
import { draftState } from "./draftState";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const DRAFT = { weeks: [] } as unknown as AiDraftDto;

const mkProgram = (o: Partial<ProgramDto> & { id: string }): ProgramDto => ({
  clientId: "c1",
  name: "Base",
  description: null,
  status: "draft",
  version: 1,
  aiAssisted: true,
  createdFromProgramId: null,
  weeks: [],
  createdAt: "2026-11-01T00:00:00Z",
  ...o,
});
const mkGen = (o: Partial<GenerationDto> & { id: string }): GenerationDto => ({
  clientId: "c1",
  basedOnProgramId: null,
  kind: "block",
  targetWeek: null,
  providerId: "zai",
  model: "m",
  status: "validated",
  draft: DRAFT,
  error: null,
  parentGenerationId: null,
  revisionMessage: null,
  instructions: null,
  rejectReason: null,
  approvedProgramId: null,
  exampleProgramIds: [],
  createdAt: "2026-11-24T09:00:00Z",
  ...o,
});

describe("draftState", () => {
  test("nothing waiting with no generations", () => {
    expect(draftState([], [], NOW)).toEqual({ ready: null, approved: null });
  });

  test("a validated latest draft is ready, numbered by its revision chain", () => {
    const gens = [
      mkGen({ id: "g2", parentGenerationId: "g1", createdAt: "2026-11-24T09:30:00Z" }),
      mkGen({ id: "g1", status: "rejected" }),
    ];
    const s = draftState(gens, [], NOW);
    expect(s.ready?.gen.id).toBe("g2");
    expect(s.ready?.version).toBe(2);
    expect(s.approved).toBeNull();
  });

  test("a running, failed or draftless latest generation is not ready", () => {
    expect(draftState([mkGen({ id: "g", status: "pending", draft: null })], [], NOW).ready).toBeNull();
    expect(draftState([mkGen({ id: "g", status: "failed_provider", draft: null })], [], NOW).ready).toBeNull();
    expect(draftState([mkGen({ id: "g", draft: null })], [], NOW).ready).toBeNull();
  });

  test("an older validated draft behind a newer generation is not ready", () => {
    const gens = [mkGen({ id: "g2", status: "cancelled", createdAt: "2026-11-24T09:30:00Z" }), mkGen({ id: "g1" })];
    expect(draftState(gens, [], NOW).ready).toBeNull();
  });

  test("approved-not-active uses the approved draft's version, not the program's", () => {
    const gens = [
      mkGen({ id: "g2", status: "approved", parentGenerationId: "g1", approvedProgramId: "p", createdAt: "2026-11-24T09:30:00Z" }),
      mkGen({ id: "g1", status: "approved" }),
    ];
    const s = draftState(gens, [mkProgram({ id: "p", version: 1 })], NOW);
    expect(s.approved?.program.id).toBe("p");
    expect(s.approved?.version).toBe(2);
    expect(s.ready).toBeNull();
  });

  test("approved program that is already active is not waiting", () => {
    const gens = [mkGen({ id: "g", status: "approved", approvedProgramId: "p" })];
    expect(draftState(gens, [mkProgram({ id: "p", status: "active" })], NOW).approved).toBeNull();
  });

  test("an approved week gen is not a block waiting to activate", () => {
    const gens = [mkGen({ id: "g", kind: "week", status: "approved", approvedProgramId: "p" })];
    expect(draftState(gens, [mkProgram({ id: "p" })], NOW).approved).toBeNull();
  });

  test("a new draft can be ready while an approved block still waits", () => {
    const gens = [
      mkGen({ id: "g3", createdAt: "2026-11-24T09:45:00Z" }),
      mkGen({ id: "g1", status: "approved", approvedProgramId: "p" }),
    ];
    const s = draftState(gens, [mkProgram({ id: "p" })], NOW);
    expect(s.ready?.version).toBe(1);
    expect(s.approved?.version).toBe(1);
  });
});
