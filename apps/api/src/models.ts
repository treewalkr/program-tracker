/**
 * Row-field schemas for HTTP validation, derived from the Drizzle tables (the source of truth
 * for column names, types and nullability). Refinements add the API contract on top: length
 * limits, literal unions from @pt/shared, and JSON shapes. Nested JSON documents (program weeks,
 * phasing, …) stay zod in @pt/shared — their columns are `t.Unsafe<T>(t.Any())` here (typed,
 * unchecked) and the handler `safeParse`s them.
 *
 * Create bodies take required fields from `*Insert` and optional ones from `*Update`:
 * drizzle-typebox 0.3 types a refined optional insert column as required (runtime is right),
 * while update schemas type every field optional.
 *
 * Each generated schema is bound to a variable before `t.Pick`/`t.Omit` (Elysia drizzle docs:
 * inlining it trips "type instantiation is possibly infinite"). Routes always Pick the writable
 * fields — never id, trainerId or timestamps.
 */
import { t, type TSchema } from "elysia";
import {
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
  trainers,
} from "@pt/db/schema";
import {
  BODYWEIGHT_KG_RANGE,
  CARDIO_TARGET_UNITS,
  CLIENT_EXPERIENCES,
  CLIENT_SEXES,
  CLIENT_STATUSES,
  COACHING_RULE_CATEGORIES,
  FEEDBACK_AI_MODES,
  FEEDBACK_STATUSES,
  GLOSSARY_KINDS,
  GLOSSARY_MEANING_MAX,
  GLOSSARY_TERM_MAX,
  ROLE_LABEL_CHIP_MAX,
  ROLE_LABEL_DESCRIPTION_MAX,
  ROLE_LABEL_NAME_MAX,
  SESSION_TYPE_NAME_MAX,
  HEIGHT_CM_RANGE,
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
import { createInsertSchema, createSelectSchema, createUpdateSchema, nonNull, spread } from "./lib/drizzle-schema";

type StringOptions = Parameters<typeof t.String>[0];
/** Keep the generated string schema (e.g. uuid format) and add limits. */
const str = (limits: StringOptions) => (schema: ReturnType<typeof t.String>) => t.String({ ...schema, ...limits });
/** `t.UnionEnum` without its implicit `default: values[0]` — Elysia fills defaults into bodies,
 *  so an omitted optional field (e.g. a client's status on PATCH) would silently become values[0]. */
const oneOf = <const V extends readonly [string, ...string[]]>(values: V) => {
  const { default: _default, ...schema } = t.UnionEnum(values);
  return schema as ReturnType<typeof t.UnionEnum<V>>;
};
/** Replace the column schema. A callback (not a bare schema) so drizzle still adds null/optional. */
const as =
  <S extends TSchema>(schema: S) =>
  () =>
    schema;

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

/** Request bodies use `*Fields`; responses use `*Row` (no write limits). */

/** Expected-failure body (`status(4xx, { error })`); 422s may carry zod `issues`. */
export const ErrorBody = t.Object({ error: t.String(), issues: t.Optional(t.Unknown()) });

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
const feedbackItemFields = {
  comment: str({ minLength: 1, ...FeedbackText }),
  triageNote: str(FeedbackText),
  status: as(oneOf(FEEDBACK_STATUSES)),
};
const FeedbackItemInsert = createInsertSchema(feedbackItems, feedbackItemFields);
const FeedbackItemUpdate = createUpdateSchema(feedbackItems, feedbackItemFields);
const FeedbackCommentUpdate = createUpdateSchema(feedbackComments, { body: str(FeedbackText) });
const FeedbackReplyText = t.Required(t.Pick(FeedbackCommentUpdate, ["body"]));

/** Multipart images, the captured context and edit bookkeeping stay in the route: not columns. */
export const FeedbackModel = {
  comment: FeedbackItemInsert.properties.comment,
  triage: t.Pick(FeedbackItemUpdate, ["status", "triageNote"]),
  /** Reply text; the column is null only for status entries. */
  replyBody: nonNull(FeedbackReplyText.properties.body),
};

// ---------------------------------------------------------------------------
// LLM feedback (verdicts and notes on AI output)
// ---------------------------------------------------------------------------

const LlmFeedbackInsert = createInsertSchema(llmFeedback, {
  /** What a trainer can rate; `call` and `feedback_answer` rows are written server-side. */
  subjectKind: as(oneOf(["chat_message", "generation", "client_message"])),
  signal: as(oneOf(LLM_CLIENT_SIGNALS)),
  reasonTags: as(t.Array(oneOf(LLM_REASON_TAGS), { maxItems: 9, uniqueItems: true })),
  comment: str({ maxLength: 2000 }),
  correction: str({ maxLength: 2000 }),
  scope: as(oneOf(NOTE_SCOPES)),
});
/** Bodies send these as values or leave them out — never null. */
const LlmFeedbackNote = t.Required(t.Pick(LlmFeedbackInsert, ["comment", "correction", "scope", "ruleId"]));
const note = {
  comment: nonNull(LlmFeedbackNote.properties.comment),
  correction: t.Optional(nonNull(LlmFeedbackNote.properties.correction)),
  /** Should it apply again? Anything but "once" proposes a coaching rule. */
  scope: t.Optional(nonNull(LlmFeedbackNote.properties.scope)),
  reasonTags: LlmFeedbackInsert.properties.reasonTags,
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

const TrainerUpdate = createUpdateSchema(trainers, { feedbackAiMode: as(oneOf(FEEDBACK_AI_MODES)) });

const TrainerAiMode = t.Required(t.Pick(TrainerUpdate, ["feedbackAiMode"]));

export const AccountModel = {
  feedbackEmails: TrainerUpdate.properties.feedbackEmails,
  /** Required, with no implicit default: an empty body is a 422, not "off". */
  feedbackAiMode: t.Object({ mode: TrainerAiMode.properties.feedbackAiMode }),
};
