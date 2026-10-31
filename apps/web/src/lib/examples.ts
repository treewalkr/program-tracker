import { cloneProgramWeeks } from "@pt/shared";
import type { ProgramExampleDto, ProgramPhasingDto, ProgramWeekDto } from "./api/types";

export interface ReuseProgramInput {
  clientId: string;
  name: string;
  description: null;
  weeks: ProgramWeekDto[];
  phasing: ProgramPhasingDto | null;
  createdFromProgramId: string;
}

/** Build the createProgram input that reuses an example for a client:
 *  fresh-cloned weeks (new ids, same catalog refs/roles/sets), the example's
 *  name and phasing, no description (it references the source client), and
 *  provenance pointing back at the example's program. */
export function toReuseInput(e: ProgramExampleDto, clientId: string): ReuseProgramInput {
  return {
    clientId,
    name: e.program.name,
    description: null,
    weeks: cloneProgramWeeks(e.program.weeks),
    phasing: e.program.phasing ?? null,
    createdFromProgramId: e.programId,
  };
}
