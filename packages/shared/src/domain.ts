import { z } from "zod";

// ---------------------------------------------------------------------------
// Core enums / vocabularies
// ---------------------------------------------------------------------------

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "traps",
  "cardio",
  "full_body",
] as const;
export const MuscleGroup = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "plate_loaded",
  "other",
] as const;
export const Equipment = z.enum(EQUIPMENT);
export type Equipment = z.infer<typeof Equipment>;

// ---------------------------------------------------------------------------
// Trainer / Client
// ---------------------------------------------------------------------------

/** Client status drives what they can see and do. */
export const CLIENT_STATUSES = ["active", "paused", "archived"] as const;
export const ClientStatus = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof ClientStatus>;

export const Client = z.object({
  id: z.string().uuid(),
  trainerId: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  status: ClientStatus.default("active"),
  /** Free-text training goal, fed to the AI as context. */
  goals: z.string().max(2000).optional(),
  /** Injuries / limitations. MUST reach the AI prompt — safety signal. */
  limitations: z.string().max(2000).optional(),
  /** Training days per week the client can commit to. */
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  createdAt: z.string(),
});
export type Client = z.infer<typeof Client>;

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const Exercise = z.object({
  id: z.string().uuid(),
  /** null on the global seed library; set for trainer-defined custom exercises. */
  trainerId: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  primaryMuscleGroup: MuscleGroup,
  secondaryMuscleGroups: z.array(MuscleGroup).max(4).default([]),
  equipment: Equipment,
});
export type Exercise = z.infer<typeof Exercise>;

// ---------------------------------------------------------------------------
// Program prescription
// ---------------------------------------------------------------------------

export const PROGRAM_STATUSES = ["draft", "active", "archived"] as const;
export const ProgramStatus = z.enum(PROGRAM_STATUSES);
export type ProgramStatus = z.infer<typeof ProgramStatus>;

export const SET_TYPES = ["warm_up", "working", "backoff"] as const;
export const SetType = z.enum(SET_TYPES);
export type SetType = z.infer<typeof SetType>;

/** A single prescribed set within a program exercise. */
export const PrescribedSet = z.object({
  /** 1-indexed order within the exercise. */
  setNumber: z.number().int().min(1).max(20),
  type: SetType.default("working"),
  /** Target rep count. When `amrap` is true this is the *minimum*. */
  reps: z.number().int().min(1).max(100),
  amrap: z.boolean().default(false),
  /** Target rate of perceived exertion, 1–10. */
  targetRpe: z.number().min(1).max(10).optional(),
  /** Planned rest after this set, in seconds. */
  restSeconds: z.number().int().min(0).max(600).optional(),
});
export type PrescribedSet = z.infer<typeof PrescribedSet>;

export const ProgramExercise = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid(),
  /** 0-indexed order within the session. */
  order: z.number().int().min(0),
  prescribedSets: z.array(PrescribedSet).min(1).max(20),
  /** Coach cue for this exercise in this program, e.g. "2s pause at bottom". */
  notes: z.string().max(1000).optional(),
});
export type ProgramExercise = z.infer<typeof ProgramExercise>;

export const ProgramSession = z.object({
  id: z.string().uuid(),
  /** e.g. "Day A — Lower". */
  name: z.string().min(1).max(160),
  order: z.number().int().min(0),
  exercises: z.array(ProgramExercise).min(1).max(20),
  notes: z.string().max(2000).optional(),
});
export type ProgramSession = z.infer<typeof ProgramSession>;

export const Program = z.object({
  id: z.string().uuid(),
  trainerId: z.string().uuid(),
  /** null while the program is an unassigned draft. */
  clientId: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  status: ProgramStatus.default("draft"),
  /** Bumped when a trainer edits an active program (version history). */
  version: z.number().int().min(1).default(1),
  /** Set when this program was drafted by AI, possibly on top of a previous one. */
  createdFromProgramId: z.string().uuid().nullable().default(null),
  aiAssisted: z.boolean().default(false),
  sessions: z.array(ProgramSession).min(1).max(14),
  createdAt: z.string(),
});
export type Program = z.infer<typeof Program>;

// ---------------------------------------------------------------------------
// Workout logging (client side)
// ---------------------------------------------------------------------------

export const LoggedSet = z.object({
  id: z.string().uuid(),
  /** Which program exercise this set belongs to; null for ad-hoc sets. */
  programExerciseId: z.string().uuid().nullable(),
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(20),
  type: SetType.default("working"),
  /** Kilograms, one side of the story — unit policy lives in app settings. */
  weightKg: z.number().min(0).max(600).optional(),
  reps: z.number().int().min(0).max(200),
  /** Actual RPE 1–10, client-reported. */
  rpe: z.number().min(1).max(10).optional(),
});
export type LoggedSet = z.infer<typeof LoggedSet>;

export const SessionLog = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  programId: z.string().uuid(),
  /** Which program session this log was meant to be; null for freestyle. */
  programSessionId: z.string().uuid().nullable(),
  date: z.string(), // ISO date (YYYY-MM-DD)
  sets: z.array(LoggedSet).default([]),
  notes: z.string().max(2000).optional(),
  /** Client subjective readiness 1–10, optional but great AI signal. */
  perceivedEnergy: z.number().min(1).max(10).optional(),
});
export type SessionLog = z.infer<typeof SessionLog>;

// ---------------------------------------------------------------------------
// Derived analytics (computed, not stored — inputs to AI context)
// ---------------------------------------------------------------------------

/** Epley 1RM estimate from the best logged set. */
export function estimate1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  // Reps above 12 make Epley unreliable; cap the multiplier growth.
  const cappedReps = Math.min(reps, 12);
  return Math.round(weightKg * (1 + cappedReps / 30) * 10) / 10;
}
