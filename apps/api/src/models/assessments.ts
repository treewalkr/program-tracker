/** VO₂max assessments — request/response schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { assessments } from "@pt/db/schema";
import { VO2_PROTOCOLS } from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "../utility";
import { as, oneOf, str } from "./shared";

const Day = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const row = {
  protocol: as(oneOf(VO2_PROTOCOLS)),
  /** Per-protocol numbers, checked by the shared zod Vo2Inputs in the handler. */
  inputs: as(t.Unsafe<Record<string, number>>(t.Any())),
};
const fields = { ...row, testedOn: as(Day), notes: str({ maxLength: 1000 }) };

const AssessmentInsert = createInsertSchema(assessments, fields);
const AssessmentUpdate = createUpdateSchema(assessments, fields);
const AssessmentSelect = createSelectSchema(assessments, row);

export const AssessmentModel = {
  /** No `result` or `formulaVersion`: the server computes both from the inputs. */
  create: t.Object({
    ...spread(t.Pick(AssessmentInsert, ["protocol", "testedOn", "inputs"])),
    ...spread(t.Pick(AssessmentUpdate, ["notes"])),
  }),
  update: t.Partial(t.Pick(AssessmentUpdate, ["protocol", "testedOn", "inputs", "notes"])),
  dto: AssessmentSelect,
};
