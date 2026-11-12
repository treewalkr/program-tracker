/** Paste imports — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { aiImports } from "@pt/db/schema";
import { IMPORT_MAX_CHARS } from "@pt/shared";
import { createInsertSchema, spread } from "../utility";
import { str, ProviderChoice } from "./shared";

const AiImportInsert = createInsertSchema(aiImports, { text: str({ minLength: 1, maxLength: IMPORT_MAX_CHARS }) });

export const ImportModel = {
  create: t.Object({ ...spread(t.Pick(AiImportInsert, ["clientId", "text"])), ...ProviderChoice }),
};
