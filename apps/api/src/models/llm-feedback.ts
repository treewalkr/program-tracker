/** LLM feedback — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { llmFeedback } from "@pt/db/schema";
import { LLM_CLIENT_SIGNALS, LLM_REASON_TAGS, NOTE_SCOPES } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "../utility";
import { str, oneOf, as } from "./shared";

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
