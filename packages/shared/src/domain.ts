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

export const CHAIN_MUSCLE_GROUPS = [
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
] as const; // MUSCLE_GROUPS minus "cardio" | "full_body"
export const ChainMuscleGroup = z.enum(CHAIN_MUSCLE_GROUPS);
export type ChainMuscleGroup = z.infer<typeof ChainMuscleGroup>;

export const KineticChainInput = z.object({
  muscleGroups: z
    .array(ChainMuscleGroup)
    .min(1)
    .max(12)
    .refine((gs) => new Set(gs).size === gs.length, {
      message: "muscleGroups must be unique",
    }),
});
export type KineticChainInput = z.infer<typeof KineticChainInput>;

/** Seed defaults — the fixed five, in the trainer's order. */
export const KINETIC_CHAIN_DEFAULTS: {
  name: string;
  muscleGroups: ChainMuscleGroup[];
  sortOrder: number;
}[] = [
  { name: "Intrinsic", muscleGroups: ["core", "back", "traps"], sortOrder: 1 },
  { name: "Deep Longitudinal", muscleGroups: ["back", "hamstrings", "calves"], sortOrder: 2 },
  { name: "Lateral", muscleGroups: ["core", "glutes", "quads"], sortOrder: 3 },
  { name: "Posterior Spiral", muscleGroups: ["glutes", "back", "hamstrings"], sortOrder: 4 },
  { name: "Anterior Spiral", muscleGroups: ["core", "quads", "chest"], sortOrder: 5 },
];

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

export const MOVEMENT_PATTERNS = [
  "vertical_push",
  "vertical_pull",
  "horizontal_push",
  "horizontal_pull",
  "knee_dominant",
  "hip_dominant",
  "rotation",
  "anti_rotation",
  "lateral_flexion",
  "anti_lateral_flexion",
  "trunk_flexion",
  "anti_trunk_flexion",
] as const;
export const MovementPattern = z.enum(MOVEMENT_PATTERNS);
export type MovementPattern = z.infer<typeof MovementPattern>;

export const FUNCTIONAL_MOVEMENTS = [
  "push",
  "pull",
  "bend_lift",
  "squat",
  "single_leg",
  "rotation",
  "locomotion",
] as const;
export const FunctionalMovement = z.enum(FUNCTIONAL_MOVEMENTS);
export type FunctionalMovement = z.infer<typeof FunctionalMovement>;

export const MOVEMENT_PATTERN_INFO: Record<
  MovementPattern,
  { label: string; name: string; description: string; core: boolean }
> = {
  vertical_push: {
    label: "v push",
    name: "Vertical push",
    description: "Pressing overhead — overhead/push press, jerks, handstand work.",
    core: false,
  },
  vertical_pull: {
    label: "v pull",
    name: "Vertical pull",
    description: "Pulling from above — pull-ups, chin-ups, pulldowns.",
    core: false,
  },
  horizontal_push: {
    label: "h push",
    name: "Horizontal push",
    description: "Pressing forward — bench press, push-up and fly variations.",
    core: false,
  },
  horizontal_pull: {
    label: "h pull",
    name: "Horizontal pull",
    description: "Pulling toward the torso — rows, face pulls, rear-delt work.",
    core: false,
  },
  knee_dominant: {
    label: "knee",
    name: "Knee-dominant",
    description: "Squatting patterns — knee-flexion-biased leg work.",
    core: false,
  },
  hip_dominant: {
    label: "hip",
    name: "Hip-dominant",
    description: "Hinging patterns — deadlifts, good mornings, hip thrusts, curls.",
    core: false,
  },
  rotation: {
    label: "rot",
    name: "Rotation",
    description: "Rotating the trunk under load — twists, chops.",
    core: true,
  },
  anti_rotation: {
    label: "anti-rot",
    name: "Anti-rotation",
    description: "Resisting trunk rotation — Pallof press and friends.",
    core: true,
  },
  lateral_flexion: {
    label: "lat flex",
    name: "Lateral flexion",
    description: "Bending the trunk sideways — side bends.",
    core: true,
  },
  anti_lateral_flexion: {
    label: "anti-lat",
    name: "Anti-lateral flexion",
    description: "Resisting sideways bend — side planks, suitcase carries.",
    core: true,
  },
  trunk_flexion: {
    label: "trunk flex",
    name: "Trunk flexion",
    description: "Flexing the trunk — crunches, leg raises.",
    core: true,
  },
  anti_trunk_flexion: {
    label: "anti-trunk",
    name: "Anti-trunk flexion",
    description: "Resisting trunk flexion — planks, rollouts.",
    core: true,
  },
};

export const FUNCTIONAL_MOVEMENT_INFO: Record<
  FunctionalMovement,
  { label: string; description: string }
> = {
  push: { label: "Push", description: "Pushing things away from you." },
  pull: { label: "Pull", description: "Pulling things toward you." },
  bend_lift: {
    label: "Bend & lift",
    description: "Bending and lifting from the floor — hinges, deadlifts.",
  },
  squat: { label: "Squat", description: "Squatting down and standing up." },
  single_leg: { label: "Single leg", description: "Split-stance and one-leg work." },
  rotation: { label: "Rotation", description: "Rotating and resisting rotation." },
  locomotion: {
    label: "Locomotion",
    description: "Carries, drags, gait, jumping — getting from A to B.",
  },
};

// ---------------------------------------------------------------------------
// Trainer / Client
// ---------------------------------------------------------------------------

/** Client status drives what they can see and do. */
export const CLIENT_STATUSES = ["active", "paused", "archived"] as const;
export const ClientStatus = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof ClientStatus>;

/** Weekly cardio target units — one fixed progress formula per unit (cardio.ts). */
export const CARDIO_TARGET_UNITS = ["minutes", "sessions", "zone_minutes"] as const;
export const CardioTargetUnit = z.enum(CARDIO_TARGET_UNITS);
export type CardioTargetUnit = z.infer<typeof CardioTargetUnit>;
export const CardioTarget = z.object({
  unit: CardioTargetUnit,
  value: z.number().int().min(1).max(10000),
});
export type CardioTarget = z.infer<typeof CardioTarget>;

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
  /** Standing weekly cardio target — resets every ISO week (cardio.ts math). */
  cardioTarget: CardioTarget.nullable().optional(),
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
  movementPattern: MovementPattern.nullable().optional(),
  functionalMovement: FunctionalMovement.nullable().optional(),
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

export interface PatternBalance {
  push: number;
  pull: number;
  knee: number;
  hip: number;
  core: number;
  unclassified: number;
}

export function patternBalance(
  list: readonly { movementPattern?: string | null }[]
): PatternBalance {
  const result: PatternBalance = {
    push: 0,
    pull: 0,
    knee: 0,
    hip: 0,
    core: 0,
    unclassified: 0,
  };
  for (const item of list) {
    const p = item.movementPattern;
    if (!p) {
      result.unclassified++;
      continue;
    }
    if (p === "vertical_push" || p === "horizontal_push") {
      result.push++;
    } else if (p === "vertical_pull" || p === "horizontal_pull") {
      result.pull++;
    } else if (p === "knee_dominant") {
      result.knee++;
    } else if (p === "hip_dominant") {
      result.hip++;
    }
    if (MOVEMENT_PATTERN_INFO[p as MovementPattern]?.core) {
      result.core++;
    }
  }
  return result;
}

export function formatPatternBalance(b: PatternBalance): string {
  const main = `push ${b.push} · pull ${b.pull} · knee ${b.knee} · hip ${b.hip} · core ${b.core}`;
  return b.unclassified > 0 ? `${main} · unclassified ${b.unclassified}` : main;
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

export const SESSION_KINDS = ["lifting", "cardio"] as const;
export const SessionKind = z.enum(SESSION_KINDS);
export type SessionKind = z.infer<typeof SessionKind>;

export const CardioPrescription = z.object({
  modality: z.string().min(1).max(80), // "Bike", "Run", "Rower"…
  durationMin: z.number().int().min(1).max(300).nullable().optional(), // null = unspecified (legacy)
  hrZone: z.number().int().min(1).max(5).nullable().optional(),
  intensity: z.string().max(60).optional(), // labelled intensity ("easy", "85% FTP")
  distanceKm: z.number().min(0).max(300).optional(),
  targetRpe: z.number().min(1).max(10).optional(),
});
export type CardioPrescription = z.infer<typeof CardioPrescription>;

export const ProgramSession = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    order: z.number().int().min(0), // order within its day
    kind: SessionKind.default("lifting"),
    notes: z.string().max(2000).optional(),
    exercises: z.array(ProgramExercise).max(20).default([]),
    cardio: CardioPrescription.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "lifting") {
      if (val.exercises.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting session requires at least one exercise",
          path: ["exercises"],
        });
      }
      if (val.cardio != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting session must not have cardio prescription",
          path: ["cardio"],
        });
      }
    } else if (val.kind === "cardio") {
      if (val.cardio == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio session requires cardio prescription",
          path: ["cardio"],
        });
      }
      if (val.exercises.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio session must not have exercises",
          path: ["exercises"],
        });
      }
    }
  });
export type ProgramSession = z.infer<typeof ProgramSession>;

export const ProgramDay = z.object({
  id: z.string().uuid(),
  day: z.number().int().min(1).max(14), // ordinal "Day N" within the week
  weekday: z.number().int().min(1).max(7).nullable().optional(), // 1=Mon…7=Sun
  sessions: z.array(ProgramSession).min(1).max(4),
});
export type ProgramDay = z.infer<typeof ProgramDay>;

export const ProgramWeek = z.object({
  week: z.number().int().min(1).max(26),
  days: z.array(ProgramDay).min(1).max(7),
});
export type ProgramWeek = z.infer<typeof ProgramWeek>;

/** Whole-document write boundary shared by the API and tests. */
export const ProgramWeeksDocument = z
  .array(ProgramWeek)
  .min(1)
  .max(26)
  .refine((ws) => ws.every((w, i) => w.week === i + 1), {
    message: "weeks must be contiguous, starting at week 1",
  });
export type ProgramWeeksDocument = z.infer<typeof ProgramWeeksDocument>;

/** Fill day.weekday from SORTED-ascending trainingDays by day index (decision 16);
 *  null beyond the list / when trainingDays absent. Sorting happens HERE —
 *  callers pass the client's array as-is. Pure: returns new weeks. */
export function applyDefaultWeekdays(
  weeks: ProgramWeek[],
  trainingDays?: number[] | null
): ProgramWeek[] {
  const sorted =
    trainingDays && trainingDays.length > 0
      ? [...trainingDays].sort((a, b) => a - b)
      : [];
  return weeks.map((w) => ({
    ...w,
    days: w.days.map((d, i) => ({
      ...d,
      weekday: sorted[i] ?? null,
    })),
  }));
}

/** Copy a day template into every week 1..plannedWeeks, fresh uuids per week
 *  (day/session/exercise ids; `exerciseId` catalog refs kept). */
export function stampWeeks(template: ProgramDay[], plannedWeeks: number): ProgramWeek[] {
  const weeks: ProgramWeek[] = [];
  for (let w = 1; w <= plannedWeeks; w++) {
    weeks.push({
      week: w,
      days: template.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        sessions: d.sessions.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          exercises: s.exercises.map((e) => ({
            ...e,
            id: crypto.randomUUID(),
          })),
        })),
      })),
    });
  }
  return weeks;
}

/** All sessions of one week, flattened (empty array when the week has no doc). */
export function weekSessions(weeks: ProgramWeek[], week: number): ProgramSession[] {
  const found = weeks.find((w) => w.week === week);
  if (!found) return [];
  return found.days.flatMap((d) => d.sessions);
}

/** The pre-change flat session shape incl. `conditioning` — for the data-migration
 *  script only; frozen copy of the current ProgramSession zod (:372-381). */
export const LegacyProgramSession = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  order: z.number().int().min(0),
  exercises: z.array(ProgramExercise).min(1).max(20),
  notes: z.string().max(2000).optional(),
  conditioning: z
    .object({
      label: z.string().min(1).max(80),
      detail: z.string().min(1).max(500),
    })
    .nullable()
    .optional(),
});
export type LegacyProgramSession = z.infer<typeof LegacyProgramSession>;

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

export const WEEK_METRICS = ["overall_volume", "rep_volume", "intensity"] as const;
export const WeekMetric = z.enum(WEEK_METRICS);
export type WeekMetric = z.infer<typeof WeekMetric>;

export const WeekTarget = z.object({
  metric: WeekMetric,
  deltaPercent: z.number().min(-100).max(200), // % vs the PREVIOUS week
});
export type WeekTarget = z.infer<typeof WeekTarget>;

/** One week of a periodization scheme: what this week should do. */
export const WeekPlan = z.object({
  week: z.number().int().min(1).max(26),
  directive: WeekDirective,
  target: WeekTarget.optional(),
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
  weeks: ProgramWeeksDocument,
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

export const CardioLog = z.object({
  modality: z.string().min(1).max(80),
  durationMin: z.number().int().min(1).max(300).nullable().optional(),
  hrZone: z.number().int().min(1).max(5).nullable().optional(),
  intensity: z.string().max(60).optional(),
  distanceKm: z.number().min(0).max(300).optional(),
  rpe: z.number().min(1).max(10).optional(),
});
export type CardioLog = z.infer<typeof CardioLog>;

export const SessionLog = z
  .object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    programId: z.string().uuid(),
    /** Which program session this log was meant to be; null for freestyle. */
    programSessionId: z.string().uuid().nullable(),
    date: z.string(), // ISO date (YYYY-MM-DD)
    kind: SessionKind.default("lifting"),
    cardio: CardioLog.nullable().optional(),
    sets: z.array(LoggedSet).default([]),
    notes: z.string().max(2000).optional(),
    /** Client subjective readiness 1–10, optional but great AI signal. */
    perceivedEnergy: z.number().min(1).max(10).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "lifting") {
      if (val.sets.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting log requires at least 1 set",
          path: ["sets"],
        });
      }
      if (val.cardio != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lifting log must not have cardio payload",
          path: ["cardio"],
        });
      }
    } else if (val.kind === "cardio") {
      if (val.cardio == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio log requires cardio payload",
          path: ["cardio"],
        });
      }
      if (val.sets.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cardio log must not have sets",
          path: ["sets"],
        });
      }
    }
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
