import type { AiDraftDto, ProgramDto } from "./api/types";
import {
  diffSources,
  aiDraftToDiffSource,
  programWeeksToDiffSource,
  type DiffRow,
  type DiffSource,
} from "@pt/shared";

export { diffSources, type DiffRow, type DiffSource };

export function programToDiffSource(p: ProgramDto, weekNumber?: number): DiffSource {
  return programWeeksToDiffSource(p.weeks as any, weekNumber);
}

export function draftToDiffSource(d: AiDraftDto): DiffSource {
  return aiDraftToDiffSource(d as any);
}
