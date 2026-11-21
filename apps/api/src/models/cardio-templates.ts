/** Cardio templates — request/response schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { cardioTemplates } from "@pt/db/schema";
import type { CardioTemplatePrescription } from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "../utility";
import { as, str } from "./shared";

const row = {
  /** Checked by the shared zod CardioTemplatePrescription in the handler. */
  prescription: as(t.Unsafe<CardioTemplatePrescription>(t.Any())),
};
const fields = { ...row, name: str({ minLength: 1, maxLength: 80 }), basedOn: str({ maxLength: 120 }) };

const TemplateInsert = createInsertSchema(cardioTemplates, fields);
const TemplateUpdate = createUpdateSchema(cardioTemplates, fields);
const TemplateSelect = createSelectSchema(cardioTemplates, row);

export const CardioTemplateModel = {
  create: t.Object({
    ...spread(t.Pick(TemplateInsert, ["name", "prescription"])),
    ...spread(t.Pick(TemplateUpdate, ["basedOn"])),
  }),
  update: t.Object({
    ...spread(t.Partial(t.Pick(TemplateInsert, ["name", "prescription"]))),
    archived: t.Optional(t.Boolean()),
  }),
  dto: TemplateSelect,
  preset: t.Object({
    key: t.String(),
    name: t.String(),
    summary: t.String(),
    prescription: t.Unsafe<CardioTemplatePrescription>(t.Any()),
    hidden: t.Boolean(),
  }),
};
