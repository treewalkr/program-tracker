/** Cardio modalities — request schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { cardioModalities } from "@pt/db/schema";
import { CARDIO_METRICS, MODALITY_NAME_MAX } from "@pt/shared";
import { createInsertSchema, createSelectSchema, spread } from "../utility";
import { as, oneOf, str } from "./shared";

const row = { metric: as(oneOf(CARDIO_METRICS)) };
const ModalityInsert = createInsertSchema(cardioModalities, { ...row, name: str({ minLength: 1, maxLength: MODALITY_NAME_MAX }) });
const ModalitySelect = createSelectSchema(cardioModalities, row);
const ModalityDtoRow = t.Pick(ModalitySelect, ["id", "name", "metric", "presetKey", "archivedAt"]);

export const ModalityModel = {
  /** Custom modalities only: presets are seeded, never created. */
  create: t.Pick(ModalityInsert, ["name", "metric"]),
  update: t.Object({
    ...spread(t.Partial(t.Pick(ModalityInsert, ["name", "metric"]))),
    archived: t.Optional(t.Boolean()),
  }),
  dto: t.Object({ ...spread(ModalityDtoRow), usedIn: t.Integer() }),
};
