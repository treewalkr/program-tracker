import type { GenerationDto, ProgramDto } from "./api/types";
import { generationPhase, revisionChain } from "./generation";

/** What the trainer still has to act on for a member's AI drafts. */
export interface DraftState {
  /** The newest generation is a draft waiting for review; `version` = its revision number (v1 = first draft). */
  ready: { gen: GenerationDto; version: number } | null;
  /** The newest approved block is still a draft program; `version` = the approved draft's revision number. */
  approved: { gen: GenerationDto; program: ProgramDto; version: number } | null;
}

/** `gens` newest first, as `api.generations` returns them. */
export function draftState(gens: GenerationDto[], programs: ProgramDto[], now = Date.now()): DraftState {
  const latest = gens[0] ?? null;
  const ready = latest && latest.draft && generationPhase(latest, now) === "review"
    ? { gen: latest, version: revisionChain(gens, latest.id).length }
    : null;

  let newest: GenerationDto | null = null;
  for (const g of gens) {
    if (g.status !== "approved" || g.kind !== "block" || !g.approvedProgramId) continue;
    if (!newest || g.createdAt > newest.createdAt) newest = g;
  }
  const program = newest ? programs.find((p) => p.id === newest.approvedProgramId && p.status === "draft") ?? null : null;
  const approved = newest && program ? { gen: newest, program, version: revisionChain(gens, newest.id).length } : null;

  return { ready, approved };
}
