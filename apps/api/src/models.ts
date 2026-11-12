/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import { aiGenerations, aiImports, chatMessages, clientMessages } from "@pt/db/schema";
import { CLIENT_MESSAGE_MAX_CHARS, IMPORT_MAX_CHARS } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "./utility";
import { str, as, ProviderChoice, TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Account (the signed-in trainer's own settings)
// ---------------------------------------------------------------------------

const TrainerAiMode = t.Required(t.Pick(TrainerUpdate, ["feedbackAiMode"]));

export const AccountModel = {
  feedbackEmails: TrainerUpdate.properties.feedbackEmails,
  /** Required, with no implicit default: an empty body is a 422, not "off". */
  feedbackAiMode: t.Object({ mode: TrainerAiMode.properties.feedbackAiMode }),
};

// ---------------------------------------------------------------------------
// AI generations and the calls that start them
// ---------------------------------------------------------------------------

const AiGenerationInsert = createInsertSchema(aiGenerations);
const AiGenerationUpdate = createUpdateSchema(aiGenerations, {
  instructions: str({ maxLength: 2000 }),
  direction: str({ maxLength: 500 }),
  revisionMessage: str({ minLength: 1, maxLength: 2000 }),
  rejectReason: str({ maxLength: 2000 }),
});
/** Optional values (never null) — handlers trim or pass them on as-is. */
const AiGenerationValues = t.Required(
  t.Pick(AiGenerationUpdate, ["instructions", "direction", "targetWeek", "revisionMessage", "rejectReason"])
);

export const AiGenerationModel = {
  generate: t.Object({
    ...spread(t.Pick(AiGenerationInsert, ["clientId"])),
    ...spread(t.Pick(AiGenerationUpdate, ["basedOnProgramId"])),
    ...ProviderChoice,
    instructions: t.Optional(nonNull(AiGenerationValues.properties.instructions)),
    direction: t.Optional(nonNull(AiGenerationValues.properties.direction)),
    targetWeek: t.Optional(nonNull(AiGenerationValues.properties.targetWeek)),
  }),
  /** Stored as `rejectReason`. */
  reject: t.Optional(t.Object({ reason: t.Optional(nonNull(AiGenerationValues.properties.rejectReason)) })),
  /** Stored as `revisionMessage`. */
  revise: t.Object({ message: nonNull(AiGenerationValues.properties.revisionMessage) }),
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const ChatMessageInsert = createInsertSchema(chatMessages, { content: str({ minLength: 1, maxLength: 2000 }) });
const ChatMessageUpdate = createUpdateSchema(chatMessages);

export const ChatModel = {
  /** The trainer's message (stored as `content`) and the model that answers it. */
  ask: t.Object({
    ...spread(t.Pick(ChatMessageInsert, ["clientId"])),
    message: ChatMessageInsert.properties.content,
    ...ProviderChoice,
  }),
  turn: t.Object({
    ...spread(t.Pick(ChatMessageInsert, ["clientId"])),
    ...spread(t.Pick(ChatMessageUpdate, ["generationId"])),
    message: ChatMessageInsert.properties.content,
    ...ProviderChoice,
  }),
  retry: t.Object(ProviderChoice),
};

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
