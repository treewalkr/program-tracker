/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import { aiImports, clientMessages } from "@pt/db/schema";
import { CLIENT_MESSAGE_MAX_CHARS, IMPORT_MAX_CHARS } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "./utility";
import { str, as, ProviderChoice, TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Client messages (weekly check-ins)
// ---------------------------------------------------------------------------

const clientMessageFields = {
  week: as(t.Integer({ minimum: 1, maximum: 26 })),
  finalText: str({ minLength: 1, maxLength: CLIENT_MESSAGE_MAX_CHARS }),
};
const ClientMessageInsert = createInsertSchema(clientMessages, clientMessageFields);
const ClientMessageUpdate = createUpdateSchema(clientMessages, clientMessageFields);
const ClientMessageText = t.Required(t.Pick(ClientMessageUpdate, ["finalText"]));

export const ClientMessageModel = {
  create: t.Object({
    ...spread(t.Pick(ClientMessageInsert, ["clientId", "week"])),
    /** Required here: a check-in is about one program. */
    programId: nonNull(t.Required(t.Pick(ClientMessageUpdate, ["programId"])).properties.programId),
    ...spread(t.Pick(ClientMessageUpdate, ["providerId", "model"])),
  }),
  /** Stored as `finalText` on approve. */
  edit: t.Object({ text: t.Optional(nonNull(ClientMessageText.properties.finalText)) }),
};

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
