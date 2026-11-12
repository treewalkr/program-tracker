/** Programs — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { programs } from "@pt/db/schema";
import { PROGRAM_STATUSES, type Phasing, type ProgramWeek } from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "../utility";
import { str, oneOf, as } from "./shared";

/** Narrow types only — shared by request and response schemas. */
const programRow = {
  status: as(oneOf(PROGRAM_STATUSES)),
  // zod-validated documents (ProgramWeeksDocument / Phasing) — typed, not checked here
  sessions: as(t.Unsafe<ProgramWeek[]>(t.Any())),
  phasing: as(t.Unsafe<Phasing>(t.Any())),
};
/** Write limits — request bodies only, so an older row past a limit still reads back. */
const programFields = {
  ...programRow,
  name: str({ minLength: 1, maxLength: 160 }),
  description: str({ maxLength: 2000 }),
  direction: str({ maxLength: 500 }),
};

export const ProgramInsert = createInsertSchema(programs, programFields);
export const ProgramUpdate = createUpdateSchema(programs, programFields);
export const ProgramSelect = createSelectSchema(programs, programRow);

export const ProgramModel = {
  /** The API names the `sessions` column `weeks`. */
  create: t.Object({
    ...spread(t.Pick(ProgramInsert, ["name"])),
    ...spread(t.Pick(ProgramUpdate, ["clientId", "description", "direction", "aiAssisted", "createdFromProgramId", "phasing"])),
    weeks: ProgramInsert.properties.sessions,
  }),
  replace: t.Object({
    weeks: ProgramInsert.properties.sessions,
    ...spread(t.Pick(ProgramUpdate, ["phasing", "direction"])),
  }),
  direction: t.Required(t.Pick(ProgramUpdate, ["direction"])),
  status: t.Required(t.Pick(ProgramUpdate, ["status"])),
  /** `toProgramDto`: the row with `sessions` renamed to `weeks`. */
  dto: t.Object({ ...spread(t.Omit(ProgramSelect, ["sessions"])), weeks: ProgramSelect.properties.sessions }),
};
