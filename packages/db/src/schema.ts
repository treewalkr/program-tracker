import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AiProgramDraft, Phasing, ProgramSession, WeekPlan } from "@pt/shared";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const trainers = pgTable("trainers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id")
    .notNull()
    .references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("active"), // ClientStatus
  goals: text("goals"),
  limitations: text("limitations"),
  daysPerWeek: integer("days_per_week"),
  /** Planned training weekdays as ISO ints (1=Mon … 7=Sun). */
  trainingDays: jsonb("training_days").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** null = global seed library (WGER import); non-null = trainer custom. */
  trainerId: uuid("trainer_id").references(() => trainers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  primaryMuscleGroup: text("primary_muscle_group").notNull(),
  secondaryMuscleGroups: jsonb("secondary_muscle_groups")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  equipment: text("equipment").notNull(),
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
  status: text("status").notNull().default("draft"), // ProgramStatus
  version: integer("version").notNull().default(1),
  createdFromProgramId: uuid("created_from_program_id"),
  aiAssisted: boolean("ai_assisted").notNull().default(false),
  /** Whole-program document, validated by shared ProgramSession[] zod schema on write. */
  sessions: jsonb("sessions").$type<ProgramSession[]>().notNull(),
  /** Stamped on first activation; block-week math derives from it. */
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  /** Periodization plan (scheme copy) — structured input to signals + AI context. */
  phasing: jsonb("phasing").$type<Phasing>(),
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
  type: text("type").notNull().default("working"), // SetType
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
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull().default("pending"), // GenerationStatus
  draft: jsonb("draft").$type<AiProgramDraft>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Trainer = typeof trainers.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type SessionLogRow = typeof sessionLogs.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;
export type AiGenerationRow = typeof aiGenerations.$inferSelect;

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

export type PromptTemplateRow = typeof promptTemplates.$inferSelect;
export type PeriodizationSchemeRow = typeof periodizationSchemes.$inferSelect;
export type SignalSnoozeRow = typeof signalSnoozes.$inferSelect;
export type SignalOutboxRow = typeof signalOutbox.$inferSelect;
