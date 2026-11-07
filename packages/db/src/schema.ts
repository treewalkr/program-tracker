import {
  type AnyPgColumn,
  boolean,
  customType,
  date,
  index,
  integer,
  smallint,
  jsonb,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  AiClientMessageDraft,
  AiProgramDraft,
  CardioLog,
  CardioTarget,
  ClientStatus,
  ExampleLevel,
  FeedbackContext,
  FeedbackEmailPrefs,
  FeedbackStatus,
  FunctionalMovement,
  GenerationStatus,
  LlmCallStatus,
  LlmPurpose,
  LlmSignal,
  LlmSubjectKind,
  MovementPattern,
  Phasing,
  ProgramStatus,
  ProgramWeek,
  SessionKind,
  SetType,
  StoredChatProposal,
  WeekPlan,
  WeekSummaryStats,
} from "@pt/shared";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const trainers = pgTable("trainers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** Google account id (`sub`) — set on first Google sign-in. */
  googleSub: text("google_sub").unique(),
  avatarUrl: text("avatar_url"),
  /** Set by the platform admin to block sign-in; null = access allowed. */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  /** Opt-out switch for feedback emails (new items, replies, status changes). */
  feedbackEmails: boolean("feedback_emails").notNull().default(true),
  /** Which feedback emails, under the master switch above. */
  feedbackEmailPrefs: jsonb("feedback_email_prefs")
    .$type<FeedbackEmailPrefs>()
    .notNull()
    .default(sql`'{"newTickets":true,"replies":"all","status":true}'::jsonb`),
  /** Secret for unsubscribe links in emails; created on first email, resettable. */
  emailToken: text("email_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Signed-in browser sessions. `id` is the sha256 of the cookie token, never the token itself. */
export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: text("status").$type<ClientStatus>().notNull().default("active"),
  goals: text("goals"),
  limitations: text("limitations"),
  /** Lifting sessions per week (cardio does not count). */
  sessionsPerWeek: integer("sessions_per_week"),
  /** Planned training weekdays as ISO ints (1=Mon … 7=Sun). */
  trainingDays: jsonb("training_days").$type<number[]>(),
  /** Standing weekly cardio target {unit, value} — null = none. */
  cardioTarget: jsonb("cardio_target").$type<CardioTarget>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** null = global seed library (packages/db/library); non-null = trainer custom. */
  trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  primaryMuscleGroup: text("primary_muscle_group").notNull(),
  secondaryMuscleGroups: jsonb("secondary_muscle_groups")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  equipment: text("equipment").notNull(),
  movementPattern: text("movement_pattern").$type<MovementPattern>(),
  functionalMovement: text("functional_movement").$type<FunctionalMovement>(),
  /** Trainer's setup cues — shown in programs and passed to the AI. */
  note: text("note"),
  /** Set = archived (custom) or hidden (seed): out of pickers and AI catalogs; programs and logs keep it. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Programs — versioned documents
// ---------------------------------------------------------------------------

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").$type<ProgramStatus>().notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdFromProgramId: uuid("created_from_program_id"),
  aiAssisted: boolean("ai_assisted").notNull().default(false),
  /** Whole-program document, validated by shared ProgramWeeksDocument on write. */
  sessions: jsonb("sessions").$type<ProgramWeek[]>().notNull(),
  /** Stamped on first activation; block-week math derives from it. */
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  /** Periodization plan (scheme copy) — structured input to signals + AI context. */
  phasing: jsonb("phasing").$type<Phasing>(),
  /** Standing direction (block-level steer) — every weekly generation follows it. */
  direction: text("direction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Logging — normalized for history queries (AI context)
// ---------------------------------------------------------------------------

export const sessionLogs = pgTable("session_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  /** Which prescribed session this was; null = freestyle workout. */
  programSessionId: uuid("program_session_id"),
  date: date("date").notNull(),
  /** "lifting" (sets below) or "cardio" (payload in `cardio`). */
  kind: text("kind").$type<SessionKind>().notNull().default("lifting"),
  /** Cardio actuals when kind = "cardio". */
  cardio: jsonb("cardio").$type<CardioLog>(),
  notes: text("notes"),
  perceivedEnergy: integer("perceived_energy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const setLogs = pgTable("set_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionLogId: uuid("session_log_id")
    .notNull()
    .references(() => sessionLogs.id, { onDelete: "cascade" }),
  /** Mirrors program_exercises.id inside the program jsonb; null = ad-hoc. */
  programExerciseId: uuid("program_exercise_id"),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "restrict" }),
  setNumber: integer("set_number").notNull(),
  type: text("type").$type<SetType>().notNull().default("working"),
  weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
  reps: integer("reps").notNull(),
  rpe: numeric("rpe", { precision: 3, scale: 1 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// AI generation audit trail
// ---------------------------------------------------------------------------

export const aiGenerations = pgTable("ai_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  basedOnProgramId: uuid("based_on_program_id").references(() => programs.id, {
    onDelete: "set null",
  }),
  kind: text("kind").$type<"block" | "week">().notNull().default("block"),
  targetWeek: integer("target_week"),
  direction: text("direction"),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  effort: text("effort"),
  status: text("status").$type<GenerationStatus>().notNull().default("pending"),
  draft: jsonb("draft").$type<AiProgramDraft>(),
  error: text("error"),
  parentGenerationId: uuid("parent_generation_id").references((): AnyPgColumn => aiGenerations.id, {
    onDelete: "set null",
  }),
  revisionMessage: text("revision_message"),
  /** True when the trainer edited this version by hand (no AI call), e.g. the block plan. */
  manualEdit: boolean("manual_edit").notNull().default(false),
  instructions: text("instructions"),
  rejectReason: text("reject_reason"),
  approvedProgramId: uuid("approved_program_id").references((): AnyPgColumn => programs.id, {
    onDelete: "set null",
  }),
  /** Example programs whose text was injected into this generation's prompt. */
  exampleProgramIds: jsonb("example_program_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Trainer = typeof trainers.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type SessionLogRow = typeof sessionLogs.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;
export type AiGenerationRow = typeof aiGenerations.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** "trainer" = the human; "assistant" = the AI. */
  role: text("role").$type<"trainer" | "assistant">().notNull(),
  /** chat = plain Q&A · revision = trainer's revise send · draft = draft-ready notice · error = failed call · proposal = AI-proposed change list awaiting Build. */
  kind: text("kind").$type<"chat" | "revision" | "draft" | "error" | "proposal">().notNull().default("chat"),
  content: text("content").notNull(),
  /** Generation this message concerns (revision sends and their draft/error replies). */
  generationId: uuid("generation_id").references((): AnyPgColumn => aiGenerations.id, {
    onDelete: "set null",
  }),
  /** Proposal turn payload (kind "proposal"); null for every other kind. */
  proposal: jsonb("proposal").$type<StoredChatProposal>(),
  /** Set by "Clear chat": hidden from the thread, kept for the LLM dataset. */
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChatMessageRow = typeof chatMessages.$inferSelect;

// ---------------------------------------------------------------------------
// Trainer library — instruction templates + periodization schemes
// ---------------------------------------------------------------------------

/** Standing rules for AI generations (RPE caps, block conventions, equipment). */
export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trainer-owned week-by-week progression schemes. Programs keep their own
 *  phasing copy, so deleting a scheme never rewrites history. */
export const periodizationSchemes = pgTable("periodization_schemes", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  weeks: jsonb("weeks").$type<WeekPlan[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Gold-standard programs the AI uses as few-shot examples (trainer-curated). */
export const programExamples = pgTable("program_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" })
    .unique(),
  goal: text("goal").notNull(),
  level: text("level").$type<ExampleLevel>().notNull(),
  daysPerWeek: integer("days_per_week").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProgramExampleRow = typeof programExamples.$inferSelect;

// ---------------------------------------------------------------------------
// Notifications — signals are derived state; only snoozes + outbox persist
// -----------------------------------------------------------------------------

export const signalSnoozes = pgTable(
  "signal_snoozes",
  {
    signalId: text("signal_id").notNull(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.signalId, t.trainerId] })]
);

/** Write-path dedupe queue; consumed by the (L5) email dispatcher. */
export const signalOutbox = pgTable("signal_outbox", {
  signalId: text("signal_id").primaryKey(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kineticChains = pgTable("kinetic_chains", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  muscleGroups: jsonb("muscle_groups").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("kinetic_chains_trainer_name_key").on(t.trainerId, t.name)]);

/** Distilled standing preferences — the trainer's learned style, injected into every prompt. */
export const trainerPreferences = pgTable("trainer_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  /** null = trainer-wide style document. */
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  document: text("document").notNull(),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type TrainerPreferenceRow = typeof trainerPreferences.$inferSelect;

export type PromptTemplateRow = typeof promptTemplates.$inferSelect;
export type PeriodizationSchemeRow = typeof periodizationSchemes.$inferSelect;
export type SignalSnoozeRow = typeof signalSnoozes.$inferSelect;
export type SignalOutboxRow = typeof signalOutbox.$inferSelect;
export type KineticChainRow = typeof kineticChains.$inferSelect;

// ---------------------------------------------------------------------------
// Client-facing weekly messages — AI-drafted, trainer-approved, copy-to-LINE
// ---------------------------------------------------------------------------

export const clientMessages = pgTable("client_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
  week: integer("week").notNull(),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  status: text("status").$type<GenerationStatus>().notNull().default("pending"),
  draft: jsonb("draft").$type<AiClientMessageDraft>(),
  /** Deterministic stats snapshot the prompt was built from. */
  stats: jsonb("stats").$type<WeekSummaryStats>(),
  /** Final trainer-approved text (set on approve). */
  finalText: text("final_text"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ClientMessageRow = typeof clientMessages.$inferSelect;

// ---------------------------------------------------------------------------
// Feedback mode — trainer comments pinned to a UI element (see @pt/shared feedback)
// ---------------------------------------------------------------------------

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const feedbackItems = pgTable("feedback_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human handle FB-<number>. */
  number: serial("number").notNull(),
  /** Who filed it; null for items filed before authorship was recorded. */
  trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "set null" }),
  status: text("status").$type<FeedbackStatus>().notNull().default("new"),
  /** Trainer's words, verbatim. */
  comment: text("comment").notNull(),
  /** Owner's triage decision; outranks the comment for the coding agent. */
  triageNote: text("triage_note"),
  route: text("route").notNull(),
  /** `file:line:column` of the clicked element. */
  source: text("source"),
  context: jsonb("context").$type<FeedbackContext>().notNull(),
  elementShot: bytea("element_shot"),
  pageShot: bytea("page_shot"),
  /** App version that was live when the item was marked done. */
  shippedIn: text("shipped_in"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("feedback_items_trainer_idx").on(t.trainerId)]);
export type FeedbackItemRow = typeof feedbackItems.$inferSelect;

/** A feedback item's thread: replies, plus one entry per status change. */
export const feedbackComments = pgTable("feedback_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
  trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "set null" }),
  kind: text("kind").$type<"reply" | "status">().notNull(),
  /** Reply text; null for status entries. */
  body: text("body"),
  /** Status moved to; null for replies. */
  status: text("status").$type<FeedbackStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("feedback_comments_item_idx").on(t.itemId, t.createdAt)]);
export type FeedbackCommentRow = typeof feedbackComments.$inferSelect;

/** When each trainer last looked at each item — drives the unread count. */
export const feedbackReads = pgTable("feedback_reads", {
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.trainerId, t.itemId] })]);

/** Tickets a trainer muted: no emails about them, whatever their prefs. */
export const feedbackMutes = pgTable("feedback_mutes", {
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.trainerId, t.itemId] })]);

// ---------------------------------------------------------------------------
// Session types — trainer-owned labels over the fixed formats (see @pt/shared sessionTypes)
// ---------------------------------------------------------------------------

export const sessionTypes = pgTable(
  "session_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "lifting" (exercises + sets) or "cardio" (cardio prescription). */
    format: text("format").$type<SessionKind>().notNull(),
    /** Set = out of the picker and AI list; programs keep the captured name. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_types_trainer_name_idx").on(t.trainerId, sql`lower(${t.name})`)]
);
export type SessionTypeRow = typeof sessionTypes.$inferSelect;

// ---------------------------------------------------------------------------
// LLM interaction log (docs/llm-logging-plan.md) — append-only
// ---------------------------------------------------------------------------

/** Content-addressed prompt text: each message is stored once, calls reference the hash. */
export const llmBlobs = pgTable("llm_blobs", {
  sha256: text("sha256").primaryKey(),
  content: text("content").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface LlmRequestRef {
  role: "system" | "user" | "assistant";
  sha: string;
}

/** One row per provider HTTP attempt (mock included, flagged). */
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Groups the attempts (and calls) of one user action. */
    turnId: uuid("turn_id").notNull(),
    purpose: text("purpose").$type<LlmPurpose>().notNull(),
    trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    generationId: uuid("generation_id").references(() => aiGenerations.id, { onDelete: "set null" }),
    chatMessageId: uuid("chat_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    clientMessageId: uuid("client_message_id").references(() => clientMessages.id, { onDelete: "set null" }),
    providerId: text("provider_id").notNull(),
    model: text("model").notNull(),
    effort: text("effort"),
    temperature: real("temperature"),
    maxTokens: integer("max_tokens"),
    jsonMode: boolean("json_mode").notNull(),
    /** `<builder>:<hash of the prompt module source>` — evals by prompt version. */
    promptVersion: text("prompt_version").notNull(),
    /** API build that made the call ("0.1.3+42a93f5"). */
    appBuild: text("app_build"),
    attempt: integer("attempt").notNull().default(1),
    /** The exact messages, in order, as blob references. */
    requestBlobIds: jsonb("request_blob_ids").$type<LlmRequestRef[]>().notNull(),
    /** Structured inputs, so a new prompt builder can re-render this case. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    responseRaw: text("response_raw"),
    reasoning: text("reasoning"),
    parsed: jsonb("parsed"),
    status: text("status").$type<LlmCallStatus>().notNull(),
    error: text("error"),
    httpStatus: integer("http_status"),
    finishReason: text("finish_reason"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    tokensReasoning: integer("tokens_reasoning"),
    tokensCached: integer("tokens_cached"),
    latencyMs: integer("latency_ms"),
    isMock: boolean("is_mock").notNull().default(false),
    /** Set when retention pruned response_raw/reasoning. */
    prunedAt: timestamp("pruned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("llm_calls_trainer_idx").on(t.trainerId, t.createdAt),
    index("llm_calls_purpose_idx").on(t.purpose, t.status),
    index("llm_calls_generation_idx").on(t.generationId),
    index("llm_calls_turn_idx").on(t.turnId),
    index("llm_calls_chat_message_idx").on(t.chatMessageId),
    index("llm_calls_client_message_idx").on(t.clientMessageId),
  ]
);
export type LlmCallRow = typeof llmCalls.$inferSelect;

/** Every verdict on an LLM output, explicit (thumbs) or implicit (approve, reject, …). Insert-only. */
export const llmFeedback = pgTable(
  "llm_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    callId: uuid("call_id").references(() => llmCalls.id, { onDelete: "set null" }),
    subjectKind: text("subject_kind").$type<LlmSubjectKind>().notNull(),
    /** No FK: the subject row may be deleted; the verdict stays. */
    subjectId: uuid("subject_id").notNull(),
    signal: text("signal").$type<LlmSignal>().notNull(),
    score: smallint("score"),
    reasonTags: text("reason_tags").array().notNull().default(sql`'{}'::text[]`),
    comment: text("comment"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("llm_feedback_subject_idx").on(t.subjectKind, t.subjectId),
    index("llm_feedback_call_idx").on(t.callId),
  ]
);
export type LlmFeedbackRow = typeof llmFeedback.$inferSelect;

/** Dataset views (migration 0027) — read-only. */
export const llmExamples = pgView("llm_examples", {
  callId: uuid("call_id").notNull(),
  turnId: uuid("turn_id").notNull(),
  purpose: text("purpose").$type<LlmPurpose>().notNull(),
  trainerId: uuid("trainer_id"),
  clientId: uuid("client_id"),
  generationId: uuid("generation_id"),
  chatMessageId: uuid("chat_message_id"),
  clientMessageId: uuid("client_message_id"),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  isMock: boolean("is_mock").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  label: text("label").$type<"gold" | "silver" | "negative" | "unlabeled">().notNull(),
  signals: text("signals").array().notNull(),
  reasonTags: text("reason_tags").array().notNull(),
  comments: text("comments").array().notNull(),
  editPayload: jsonb("edit_payload").$type<Record<string, unknown>>(),
}).existing();

export const llmPairs = pgView("llm_pairs", {
  kind: text("kind").$type<"revision" | "sibling">().notNull(),
  trainerId: uuid("trainer_id"),
  clientId: uuid("client_id"),
  preferredGenerationId: uuid("preferred_generation_id").notNull(),
  preferredCallId: uuid("preferred_call_id").notNull(),
  nonPreferredGenerationId: uuid("non_preferred_generation_id").notNull(),
  nonPreferredCallId: uuid("non_preferred_call_id").notNull(),
  critique: text("critique"),
  isMock: boolean("is_mock").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}).existing();
