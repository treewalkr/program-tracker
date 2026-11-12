/** Feature models not yet moved to ./models/<feature>.ts. */
import { t } from "elysia";
import {
  aiGenerations,
  aiImports,
  chatMessages,
  clientMessages,
  clients,
  coachingRules,
  exerciseAliases,
  exercises,
  feedbackComments,
  feedbackItems,
  glossaryTerms,
  llmFeedback,
  programs,
  roleLabels,
  sessionTypes,
  trainerPreferences,
} from "@pt/db/schema";
import {
  BODYWEIGHT_KG_RANGE,
  CARDIO_TARGET_UNITS,
  CLIENT_EXPERIENCES,
  CLIENT_SEXES,
  CLIENT_MESSAGE_MAX_CHARS,
  CLIENT_STATUSES,
  COACHING_RULE_CATEGORIES,
  FEEDBACK_STATUSES,
  GLOSSARY_KINDS,
  GLOSSARY_MEANING_MAX,
  GLOSSARY_TERM_MAX,
  ROLE_LABEL_CHIP_MAX,
  ROLE_LABEL_DESCRIPTION_MAX,
  ROLE_LABEL_NAME_MAX,
  SESSION_TYPE_NAME_MAX,
  HEIGHT_CM_RANGE,
  IMPORT_MAX_CHARS,
  LLM_CLIENT_SIGNALS,
  LLM_REASON_TAGS,
  NOTE_SCOPES,
  PHONE_MAX,
  PROGRAM_STATUSES,
  type CardioTarget,
  type DeloadSettings,
  type OneRepMaxes as OneRepMaxesType,
  type Phasing,
  type ProgramWeek,
} from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, nonNull, spread } from "./utility";
import { str, oneOf, as, ProviderChoice, TrainerInsert, TrainerUpdate } from "./models/shared";

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/** Narrow types only — shared by request and response schemas. */
const programRow = {
  status: as(oneOf(PROGRAM_STATUSES)),
  // zod-validated documents (ProgramWeeksDocument / Phasing) — typed, not checked here
  sessions: as(t.Unsafe<ProgramWeek[]>(t.Any())),
  phasing: as(t.Unsafe<Phasing>(t.Any())),
};
/** Write limits — request bodies only, so an older row past a limit still reads back. */
const programFields = {
  ...programRow,
  name: str({ minLength: 1, maxLength: 160 }),
  description: str({ maxLength: 2000 }),
  direction: str({ maxLength: 500 }),
};

export const ProgramInsert = createInsertSchema(programs, programFields);
export const ProgramUpdate = createUpdateSchema(programs, programFields);
export const ProgramSelect = createSelectSchema(programs, programRow);

export const ProgramModel = {
  /** The API names the `sessions` column `weeks`. */
  create: t.Object({
    ...spread(t.Pick(ProgramInsert, ["name"])),
    ...spread(t.Pick(ProgramUpdate, ["clientId", "description", "direction", "aiAssisted", "createdFromProgramId", "phasing"])),
    weeks: ProgramInsert.properties.sessions,
  }),
  replace: t.Object({
    weeks: ProgramInsert.properties.sessions,
    ...spread(t.Pick(ProgramUpdate, ["phasing", "direction"])),
  }),
  direction: t.Required(t.Pick(ProgramUpdate, ["direction"])),
  status: t.Required(t.Pick(ProgramUpdate, ["status"])),
  /** `toProgramDto`: the row with `sessions` renamed to `weeks`. */
  dto: t.Object({ ...spread(t.Omit(ProgramSelect, ["sessions"])), weeks: ProgramSelect.properties.sessions }),
};

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const Day = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const IsoWeekday = t.Integer({ minimum: 1, maximum: 7 });

/** exerciseId → { kg, date } (mirrors shared `OneRepMaxes`). */
const OneRepMaxes = t.Record(
  t.String({ minLength: 1 }),
  t.Object({ kg: t.Number({ exclusiveMinimum: 0, maximum: 600 }), date: Day }),
  { maxProperties: 200 }
);

/** Narrow types only — shared by request and response schemas. */
const clientRow = {
  status: as(oneOf(CLIENT_STATUSES)),
  experience: as(oneOf(CLIENT_EXPERIENCES)),
  sex: as(oneOf(CLIENT_SEXES)),
  trainingDays: as(t.Unsafe<number[]>(t.Any())),
  cardioTarget: as(t.Unsafe<CardioTarget>(t.Any())),
  cardioDays: as(t.Unsafe<number[]>(t.Any())),
  oneRepMaxes: as(t.Unsafe<OneRepMaxesType>(t.Any())),
  deloadSettings: as(t.Unsafe<DeloadSettings>(t.Any())),
};

/** Write limits — request bodies only. `deloadSettings` has its own zod-validated route. */
const clientFields = {
  ...clientRow,
  name: str({ minLength: 1, maxLength: 120 }),
  /** `""` is accepted and stored as NULL by the route. */
  email: as(t.Union([t.String({ format: "email" }), t.Literal("")])),
  goals: str({ maxLength: 2000 }),
  limitations: str({ maxLength: 2000 }),
  sessionsPerWeek: as(IsoWeekday),
  trainingDays: as(t.Array(IsoWeekday, { uniqueItems: true })),
  cardioTarget: as(t.Object({ unit: oneOf(CARDIO_TARGET_UNITS), value: t.Integer({ minimum: 1, maximum: 10000 }) })),
  cardioDays: as(t.Array(IsoWeekday, { uniqueItems: true, maxItems: 7 })),
  longRunDay: as(IsoWeekday),
  oneRepMaxes: as(OneRepMaxes),
  birthDate: as(Day),
  bodyweightKg: as(t.Number({ minimum: BODYWEIGHT_KG_RANGE.min, maximum: BODYWEIGHT_KG_RANGE.max })),
  heightCm: as(t.Number({ minimum: HEIGHT_CM_RANGE.min, maximum: HEIGHT_CM_RANGE.max })),
  startedOn: as(Day),
  phone: str({ maxLength: PHONE_MAX }),
};

export const ClientInsert = createInsertSchema(clients, clientFields);
export const ClientUpdate = createUpdateSchema(clients, clientFields);
const ClientSelect = createSelectSchema(clients, clientRow);

/** Optional client fields a trainer sets on create and edit. */
const clientWritable = [
  "email",
  "goals",
  "limitations",
  "sessionsPerWeek",
  "trainingDays",
  "cardioTarget",
  "cardioDays",
  "longRunDay",
  "oneRepMaxes",
  "experience",
  "birthDate",
  "sex",
  "bodyweightKg",
  "heightCm",
  "startedOn",
  "phone",
] as const;

export const ClientModel = {
  create: t.Object({
    ...spread(t.Pick(ClientInsert, ["name"])),
    ...spread(t.Pick(ClientUpdate, clientWritable)),
  }),
  update: t.Pick(ClientUpdate, ["name", "status", ...clientWritable]),
  /** `clientDto`: the row plus the deload rule that applies to it. */
  dto: t.Object({ ...spread(ClientSelect), effectiveDeload: t.Unsafe<DeloadSettings>(t.Any()) }),
};

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/** Vocabulary fields stay plain strings: the route checks them with the shared zod enums
 *  (its `invalid <field>` 422), and web's ExerciseInput/ExercisePatch DTOs type them as string. */
const Vocab = t.String({ maxLength: 40 });
const exerciseFields = {
  name: str({ minLength: 1, maxLength: 160 }),
  primaryMuscleGroup: as(Vocab),
  secondaryMuscleGroups: as(t.Array(Vocab, { maxItems: 4 })),
  equipment: as(Vocab),
  movementPattern: as(Vocab),
  functionalMovement: as(Vocab),
  note: str({ maxLength: 280 }),
};

const ExerciseInsert = createInsertSchema(exercises, exerciseFields);
const ExerciseUpdate = createUpdateSchema(exercises, exerciseFields);

export const ExerciseModel = {
  create: t.Object({
    ...spread(t.Pick(ExerciseInsert, ["name", "primaryMuscleGroup", "equipment"])),
    ...spread(t.Pick(ExerciseUpdate, ["secondaryMuscleGroups", "movementPattern", "functionalMovement", "note"])),
  }),
  /** `archived` toggles the server-owned `archivedAt` stamp. */
  update: t.Object({
    ...spread(
      t.Pick(ExerciseUpdate, [
        "name",
        "primaryMuscleGroup",
        "secondaryMuscleGroups",
        "equipment",
        "movementPattern",
        "functionalMovement",
        "note",
      ])
    ),
    archived: t.Optional(t.Boolean()),
  }),
};

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

const SessionTypeInsert = createInsertSchema(sessionTypes, {
  name: str({ minLength: 1, maxLength: SESSION_TYPE_NAME_MAX }),
  /** Plain string: the route answers a bad value with "format must be lifting or cardio". */
  format: as(t.String({ maxLength: 20 })),
});

export const SessionTypeModel = {
  create: t.Pick(SessionTypeInsert, ["name", "format"]),
  update: t.Object({
    ...spread(t.Partial(t.Pick(SessionTypeInsert, ["name", "format"]))),
    archived: t.Optional(t.Boolean()),
  }),
};

// ---------------------------------------------------------------------------
// Role labels
// ---------------------------------------------------------------------------

const RoleLabelUpdate = createUpdateSchema(roleLabels, {
  name: str({ minLength: 1, maxLength: ROLE_LABEL_NAME_MAX }),
  chip: str({ maxLength: ROLE_LABEL_CHIP_MAX }),
  description: str({ maxLength: ROLE_LABEL_DESCRIPTION_MAX }),
});
const RoleLabelText = t.Required(t.Pick(RoleLabelUpdate, ["name", "chip", "description"]));
/** The route clears chip/description with "" (→ NULL), so bodies take strings, not null. */
const roleLabel = {
  name: RoleLabelText.properties.name,
  chip: nonNull(RoleLabelText.properties.chip),
  description: nonNull(RoleLabelText.properties.description),
};

export const RoleLabelModel = {
  create: t.Object({
    name: roleLabel.name,
    chip: t.Optional(roleLabel.chip),
    description: roleLabel.description,
    /** Key of the label this one sorts right after; absent = last. */
    after: t.Optional(t.String({ maxLength: 60 })),
  }),
  update: t.Object({
    name: t.Optional(roleLabel.name),
    chip: t.Optional(roleLabel.chip),
    description: t.Optional(roleLabel.description),
    rank: t.Optional(t.Number()),
  }),
};

// ---------------------------------------------------------------------------
// Coaching rules
// ---------------------------------------------------------------------------

const coachingRuleFields = {
  text: str({ minLength: 3, maxLength: 400 }),
  category: as(oneOf(COACHING_RULE_CATEGORIES)),
  /** A trainer activates or retires; only the extractor proposes. */
  status: as(oneOf(["active", "retired"])),
};
const CoachingRuleInsert = createInsertSchema(coachingRules, coachingRuleFields);
const CoachingRuleUpdate = createUpdateSchema(coachingRules, coachingRuleFields);

export const RuleScope = oneOf(["client", "always"]);

export const CoachingRuleModel = {
  create: t.Object({
    ...spread(t.Pick(CoachingRuleInsert, ["text"])),
    /** null = all clients. */
    ...spread(t.Pick(CoachingRuleUpdate, ["category", "clientId"])),
  }),
  update: t.Pick(CoachingRuleUpdate, ["text", "category", "clientId", "status"]),
  confirm: t.Object({
    scope: RuleScope,
    clientId: t.Optional(nonNull(CoachingRuleUpdate.properties.clientId)),
    text: CoachingRuleUpdate.properties.text,
  }),
};

// ---------------------------------------------------------------------------
// Vocabulary: exercise aliases and glossary
// ---------------------------------------------------------------------------

const AliasInsert = createInsertSchema(exerciseAliases, {
  alias: str({ minLength: 1, maxLength: 200 }),
  /** "seed" is written by the seeder only. */
  source: as(oneOf(["import", "manual"])),
});

const glossaryFields = {
  term: str({ minLength: 1, maxLength: GLOSSARY_TERM_MAX }),
  meaning: str({ minLength: 1, maxLength: GLOSSARY_MEANING_MAX }),
  kind: as(oneOf(GLOSSARY_KINDS)),
};
const GlossaryInsert = createInsertSchema(glossaryTerms, glossaryFields);
const GlossaryUpdate = createUpdateSchema(glossaryTerms, glossaryFields);

export const VocabularyModel = {
  saveAliases: t.Object({
    items: t.Array(t.Pick(AliasInsert, ["alias", "exerciseId", "source"]), { minItems: 1, maxItems: 200 }),
  }),
  moveAlias: t.Pick(AliasInsert, ["exerciseId"]),
  createTerm: t.Pick(GlossaryInsert, ["term", "meaning", "kind"]),
  updateTerm: t.Pick(GlossaryUpdate, ["term", "meaning", "kind"]),
};

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
