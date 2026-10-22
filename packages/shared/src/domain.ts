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
  /** Planned training weekdays, ISO: 1=Mon … 7=Sun. Drives the week strip. */
  trainingDays: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .refine((days) => new Set(days).size === days.length, {
      message: "trainingDays must be unique",
    })
    .optional(),
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

export const SET_TYPES = ["working", "backoff"] as const;
export const SetType = z.enum(SET_TYPES);
export type SetType = z.infer<typeof SetType>;

/**
 * Slot an exercise fills within a session. Array order is the classic S&C
 * session order — power → primary → strength → accessory → core — and is the
 * rank `sortExercisesByRole` uses. "core" here is the closing slot of a
 * session, not the `core` muscle group.
 */
export const EXERCISE_ROLES = ["power", "primary", "strength", "accessory", "core"] as const;
export const ExerciseRole = z.enum(EXERCISE_ROLES);
export type ExerciseRole = z.infer<typeof ExerciseRole>;

/** Chip label (the trainer's shorthand) and tooltip copy per role; also fed to the AI prompt. */
export const EXERCISE_ROLE_INFO: Record<ExerciseRole, { label: string; description: string }> = {
  power: {
    label: "Power",
    description: "Explosive, low-rep work done fresh — jumps, throws, Olympic lift variations.",
  },
  primary: {
    label: "Primary",
    description: "The main lift the session is built around — the heaviest compound movement.",
  },
  strength: {
    label: "Str",
    description: "Secondary compound strength work that supports the primary lift.",
  },
  accessory: {
    label: "Aux",
    description: "Isolation or higher-rep assistance work for hypertrophy, weak points and balance.",
  },
  core: {
    label: "Core",
    description: "Trunk and anti-movement work, typically closing the session.",
  },
};

/** Stable sort by role rank; exercises without a role keep their relative order at the end. */
export function sortExercisesByRole<T extends { role?: ExerciseRole | null }>(
  list: readonly T[]
): T[] {
  const rank = (r: ExerciseRole | null | undefined) =>
    r ? EXERCISE_ROLES.indexOf(r) : EXERCISE_ROLES.length;
  return [...list].sort((a, b) => rank(a.role) - rank(b.role));
}

/** A single prescribed set within a program exercise. */
export const PrescribedSet = z
  .object({
    /** 1-indexed order within the exercise. */
    setNumber: z.number().int().min(1).max(20),
    type: SetType.default("working"),
    /** Target rep count. 0 = not rep-based (timed or failure set).
     *  When `amrap` is true this is the *minimum*. */
    reps: z.number().int().min(0).max(100),
    amrap: z.boolean().default(false),
    /** Lower bound of a rep range — `reps` holds the upper bound (e.g. 6–10). */
    repsMin: z.number().int().min(0).max(100).optional(),
    /** Time-based prescription (planks, timed holds) — replaces reps. */
    durationSeconds: z.number().int().min(1).max(3600).optional(),
    /** Load target. Absent/null = auto-regulate by RPE (or bodyweight). */
    targetWeightKg: z.number().min(0).max(600).nullable().optional(),
    /** Target rate of perceived exertion, 1–10. */
    targetRpe: z.number().min(1).max(10).optional(),
    /** Planned rest after this set, in seconds. */
    restSeconds: z.number().int().min(0).max(600).optional(),
  })
  .refine((s) => s.reps > 0 || s.amrap || s.durationSeconds !== undefined, {
    message: "reps 0 requires amrap (failure set) or durationSeconds (timed set)",
  })
  .refine((s) => s.repsMin === undefined || s.repsMin <= s.reps, {
    message: "repsMin must be ≤ reps (reps is the range's upper bound)",
  });
export type PrescribedSet = z.infer<typeof PrescribedSet>;

export const ProgramExercise = z.object({
  id: z.string().uuid(),
  exerciseId: z.string().uuid(),
  /**
   * Display name captured at write time (catalog name, custom-exercise name,
   * or draft name). Programs render it directly — no catalog join on read.
   */
  exerciseName: z.string().min(1).max(200).optional(),
  /** Session slot (power → primary → strength → accessory → core). Absent on programs written before roles existed. */
  role: ExerciseRole.optional(),
  /** 0-indexed order within the session. */
  order: z.number().int().min(0),
  prescribedSets: z.array(PrescribedSet).min(1).max(20),
  /** Coach cue for this exercise in this program, e.g. "2s pause at bottom". */
  notes: z.string().max(1000).optional(),
});
export type ProgramExercise = z.infer<typeof ProgramExercise>;

/** Cardio / conditioning attached to a session (zone work, intervals, easy runs). */
export const Conditioning = z.object({
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(500),
});
export type Conditioning = z.infer<typeof Conditioning>;

export const ProgramSession = z.object({
  id: z.string().uuid(),
  /** e.g. "Day A — Lower". */
  name: z.string().min(1).max(160),
  order: z.number().int().min(0),
  exercises: z.array(ProgramExercise).min(1).max(20),
  notes: z.string().max(2000).optional(),
  conditioning: Conditioning.nullable().optional(),
});
export type ProgramSession = z.infer<typeof ProgramSession>;

// ---------------------------------------------------------------------------
// Periodization (phasing)
// ---------------------------------------------------------------------------

export const WEEK_DIRECTIVES = [
  "base",
  "+volume",
  "+intensity",
  "deload",
  "transition",
  "test",
] as const;
export const WeekDirective = z.enum(WEEK_DIRECTIVES);
export type WeekDirective = z.infer<typeof WeekDirective>;

/** One week of a periodization scheme: what this week should do. */
export const WeekPlan = z.object({
  week: z.number().int().min(1).max(26),
  directive: WeekDirective,
  note: z.string().max(500).optional(),
});
export type WeekPlan = z.infer<typeof WeekPlan>;

/** The trainer's week-by-week guide for a program block. */
export const Phasing = z
  .object({
    plannedWeeks: z.number().int().min(1).max(26),
    /** Current block phase name, e.g. "accumulation". */
    phase: z.string().min(1).max(120),
    nextPhase: z.string().min(1).max(120).nullable().optional(),
    /** Explicit week-by-week progression — the trainer's periodization scheme. */
    weeks: z.array(WeekPlan).optional(),
  })
  .refine((p) => !p.weeks || p.weeks.every((w) => w.week <= p.plannedWeeks), {
    message: "week plans must fall within plannedWeeks",
  });
export type Phasing = z.infer<typeof Phasing>;

// ---------------------------------------------------------------------------
// Trainer library inputs — schemes + instruction templates
// ---------------------------------------------------------------------------

export const InstructionTemplateInput = z.object({
  name: z.string().min(1).max(120),
  content: z.string().min(1).max(4000),
});
export type InstructionTemplateInput = z.infer<typeof InstructionTemplateInput>;

export const PeriodizationSchemeInput = z
  .object({
    name: z.string().min(1).max(120),
    weeks: z.array(WeekPlan).min(2).max(26),
  })
  .refine((s) => s.weeks.every((w, i) => w.week === i + 1), {
    message: "weeks must be contiguous, starting at week 1",
  });
export type PeriodizationSchemeInput = z.infer<typeof PeriodizationSchemeInput>;

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
  /** Stamped on first activation — basis for block-week math (derived, never edited). */
  activatedAt: z.string().nullable().optional(),
  phasing: Phasing.nullable().optional(),
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
