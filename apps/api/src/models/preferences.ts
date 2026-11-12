/** Trainer preferences — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { trainerPreferences } from "@pt/db/schema";
import { createUpdateSchema } from "../utility";

const PreferenceUpdate = createUpdateSchema(trainerPreferences);

export const PreferenceModel = {
  /** clientId null/absent = the trainer-wide document; providerId/model pick the distiller. */
  distill: t.Pick(PreferenceUpdate, ["clientId", "providerId", "model"]),
};
