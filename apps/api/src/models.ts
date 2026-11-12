/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import { aiImports } from "@pt/db/schema";
import { IMPORT_MAX_CHARS } from "@pt/shared";
import { createInsertSchema, spread } from "./utility";
import { str, ProviderChoice, TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Paste imports
// ---------------------------------------------------------------------------

const AiImportInsert = createInsertSchema(aiImports, { text: str({ minLength: 1, maxLength: IMPORT_MAX_CHARS }) });

export const ImportModel = {
  create: t.Object({ ...spread(t.Pick(AiImportInsert, ["clientId", "text"])), ...ProviderChoice }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const AdminModel = {
  invite: t.Pick(TrainerInsert, ["name", "email"]),
  /** `disabled` toggles the server-owned `disabledAt` stamp. */
  editTrainer: t.Object({ ...spread(t.Pick(TrainerUpdate, ["name"])), disabled: t.Optional(t.Boolean()) }),
};
