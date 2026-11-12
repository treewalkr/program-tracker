/**
 * Row-field schemas for HTTP validation, derived from the Drizzle tables (the source of truth
 * for column names, types and nullability). Refinements add the API contract on top: length
 * limits, literal unions from @pt/shared, and JSON shapes. Nested JSON documents (program weeks,
 * phasing, …) stay zod in @pt/shared — their columns are `t.Unsafe<T>(t.Any())` here (typed,
 * unchecked) and the handler `safeParse`s them.
 *
 * Create bodies take required fields from `*Insert` and optional ones from `*Update`:
 * drizzle-typebox 0.3 types a refined optional insert column as required (runtime is right),
 * while update schemas type every field optional.
 *
 * Each generated schema is bound to a variable before `t.Pick`/`t.Omit` (Elysia drizzle docs:
 * inlining it trips "type instantiation is possibly infinite"). Routes always Pick the writable
 * fields — never id, trainerId or timestamps.
 */
import { t, type TSchema } from "elysia";
import { programs } from "@pt/db/schema";
import {
  PROGRAM_STATUSES,
  type Phasing,
  type ProgramWeek,
} from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "./lib/drizzle-schema";

type StringOptions = Parameters<typeof t.String>[0];
/** Keep the generated string schema (e.g. uuid format) and add limits. */
const str = (limits: StringOptions) => (schema: ReturnType<typeof t.String>) => t.String({ ...schema, ...limits });
/** Replace the column schema. A callback (not a bare schema) so drizzle still adds null/optional. */
const as =
  <S extends TSchema>(schema: S) =>
  () =>
    schema;

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/** Narrow types only — shared by request and response schemas. */
const programRow = {
  status: as(t.UnionEnum(PROGRAM_STATUSES)),
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

/** Request bodies use `*Fields`; responses use `*Row` (no write limits). */

/** Expected-failure body (`status(4xx, { error })`); 422s may carry zod `issues`. */
export const ErrorBody = t.Object({ error: t.String(), issues: t.Optional(t.Unknown()) });

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
