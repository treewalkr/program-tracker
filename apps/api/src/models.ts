/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import {
  aiGenerations,
  aiImports,
  chatMessages,
  clientMessages,
  feedbackComments,
  feedbackItems,
  llmFeedback,
  trainerPreferences,
} from "@pt/db/schema";
import {
  CLIENT_MESSAGE_MAX_CHARS,
  FEEDBACK_STATUSES,
  IMPORT_MAX_CHARS,
  LLM_CLIENT_SIGNALS,
  LLM_REASON_TAGS,
  NOTE_SCOPES,
} from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "./utility";
import { str, oneOf, as, ProviderChoice, TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Trainer preferences
// ---------------------------------------------------------------------------

const PreferenceUpdate = createUpdateSchema(trainerPreferences);

export const PreferenceModel = {
  /** clientId null/absent = the trainer-wide document; providerId/model pick the distiller. */
  distill: t.Pick(PreferenceUpdate, ["clientId", "providerId", "model"]),
};

// ---------------------------------------------------------------------------
// Feedback (tickets and their threads)
// ---------------------------------------------------------------------------

const FeedbackText = { maxLength: 5000 };
const GITHUB_PR_URL = "^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$";
const feedbackItemFields = {
  comment: str({ minLength: 1, ...FeedbackText }),
  /** The fix agent's pull request — a GitHub PR URL. */
  fixPr: str({ pattern: GITHUB_PR_URL, maxLength: 300 }),
  triageNote: str(FeedbackText),
  status: as(oneOf(FEEDBACK_STATUSES)),
};
const FeedbackItemInsert = createInsertSchema(feedbackItems, feedbackItemFields);
const FeedbackItemUpdate = createUpdateSchema(feedbackItems, feedbackItemFields);
const FeedbackCommentUpdate = createUpdateSchema(feedbackComments, { body: str(FeedbackText) });
const FeedbackReplyText = t.Required(t.Pick(FeedbackCommentUpdate, ["body"]));
const FeedbackItemValues = t.Required(t.Pick(FeedbackItemUpdate, ["fixPr"]));

/** Multipart images, the captured context and edit bookkeeping stay in the route: not columns. */
export const FeedbackModel = {
  comment: FeedbackItemInsert.properties.comment,
  triage: t.Pick(FeedbackItemUpdate, ["status", "triageNote"]),
  /** Reply text; the column is null only for status entries. */
  replyBody: nonNull(FeedbackReplyText.properties.body),
  /** Agent API: stored as `fixPr`. */
  fixPr: t.Object({ url: nonNull(FeedbackItemValues.properties.fixPr) }),
};

// ---------------------------------------------------------------------------
// LLM feedback (verdicts and notes on AI output)
// ---------------------------------------------------------------------------

const llmFeedbackFields = {
  /** What a trainer can rate; `call` and `feedback_answer` rows are written server-side. */
  subjectKind: as(oneOf(["chat_message", "generation", "client_message"])),
  signal: as(oneOf(LLM_CLIENT_SIGNALS)),
  reasonTags: as(t.Array(oneOf(LLM_REASON_TAGS), { maxItems: 9, uniqueItems: true })),
  comment: str({ maxLength: 2000 }),
  correction: str({ maxLength: 2000 }),
  scope: as(oneOf(NOTE_SCOPES)),
};
const LlmFeedbackInsert = createInsertSchema(llmFeedback, llmFeedbackFields);
const LlmFeedbackUpdate = createUpdateSchema(llmFeedback, llmFeedbackFields);
/** Bodies send these as values or leave them out — never null. */
const LlmFeedbackNote = t.Required(t.Pick(LlmFeedbackInsert, ["comment", "correction", "scope", "ruleId"]));
const note = {
  comment: nonNull(LlmFeedbackNote.properties.comment),
  correction: t.Optional(nonNull(LlmFeedbackNote.properties.correction)),
  /** Should it apply again? Anything but "once" proposes a coaching rule. */
  scope: t.Optional(nonNull(LlmFeedbackNote.properties.scope)),
  reasonTags: LlmFeedbackUpdate.properties.reasonTags,
  /** Stored as `ruleId`: the rule the trainer says was broken. */
  violatedRuleId: t.Optional(nonNull(LlmFeedbackNote.properties.ruleId)),
};

export const LlmFeedbackModel = {
  subject: t.Pick(LlmFeedbackInsert, ["subjectKind", "subjectId"]),
  verdict: t.Object({
    ...spread(t.Pick(LlmFeedbackInsert, ["subjectKind", "subjectId", "signal"])),
    ...note,
    comment: t.Optional(note.comment),
  }),
  /** The anchor (a JSON document) is added by the route. */
  note: t.Object({ ...spread(t.Pick(LlmFeedbackInsert, ["subjectKind", "subjectId"])), ...note }),
};

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
