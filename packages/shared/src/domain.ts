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
  "adductors",
  "calves",
  "core",
  "obliques",
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
  "adductors",
  "calves",
  "core",
  "obliques",
  "traps",
] as const; // MUSCLE_GROUPS minus "cardio" | "full_body"
export const ChainMuscleGroup = z.enum(CHAIN_MUSCLE_GROUPS);
export type ChainMuscleGroup = z.infer<typeof ChainMuscleGroup>;

export const KineticChainInput = z.object({
  muscleGroups: z
    .array(ChainMuscleGroup)
    .min(1)
    .max(CHAIN_MUSCLE_GROUPS.length)
    .refine((gs) => new Set(gs).size === gs.length, {
      message: "muscleGroups must be unique",
    }),
});
export type KineticChainInput = z.infer<typeof KineticChainInput>;

/**
 * Seed defaults — the fixed five, in the trainer's order. Groups follow the
 * sling anatomy (Vleeming; Myers): the inner unit is the deep core, the
 * anterior oblique sling is the obliques with the contralateral adductors,
 * the lateral sling is glute med/min with the adductors and QL, the posterior
 * oblique sling is glute max with the contralateral lat. Muscle groups are
 * coarse, so these are approximations; counts are descriptive, not a score.
 */
export const KINETIC_CHAIN_DEFAULTS: {
  name: string;
  muscleGroups: ChainMuscleGroup[];
  sortOrder: number;
}[] = [
  { name: "Intrinsic", muscleGroups: ["core"], sortOrder: 1 },
  { name: "Deep Longitudinal", muscleGroups: ["back", "hamstrings", "calves"], sortOrder: 2 },
  { name: "Lateral", muscleGroups: ["glutes", "adductors", "core"], sortOrder: 3 },
  { name: "Posterior Oblique", muscleGroups: ["glutes", "back"], sortOrder: 4 },
  { name: "Anterior Oblique", muscleGroups: ["obliques", "adductors"], sortOrder: 5 },
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
  "anti_extension",
  "carry",
  "isolation",
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
    description: "Knee-driven leg work — squats, lunges, leg press, Nordic curls.",
    core: false,
  },
  hip_dominant: {
    label: "hip",
    name: "Hip-dominant",
    description: "Hinging patterns — deadlifts, good mornings, hip thrusts, glute-ham raises.",
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
    description: "Resisting sideways bend — side planks, Copenhagen planks.",
    core: true,
  },
  trunk_flexion: {
    label: "trunk flex",
    name: "Trunk flexion",
    description: "Flexing the trunk — crunches, leg raises.",
    core: true,
  },
  anti_trunk_flexion: {
    label: "anti-flex",
    name: "Anti-trunk flexion",
    description: "Resisting trunk flexion — holding a neutral spine against a forward pull, e.g. back-extension holds.",
    core: true,
  },
  anti_extension: {
    label: "anti-ext",
    name: "Anti-extension",
    description: "Resisting trunk extension — planks, rollouts, dead bugs, hollow holds.",
    core: true,
  },
  carry: {
    label: "carry",
    name: "Carry",
    description: "Loaded carries — farmer's, suitcase, overhead and yoke walks.",
    core: false,
  },
  isolation: {
    label: "iso",
    name: "Isolation",
    description: "Single-joint work — curls, lateral raises, triceps extensions, calf raises.",
    core: false,
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

/** Client training experience — fed to the AI as context. */
export const CLIENT_EXPERIENCES = ["beginner", "intermediate", "advanced"] as const;
export const ClientExperience = z.enum(CLIENT_EXPERIENCES);
export type ClientExperience = z.infer<typeof ClientExperience>;

/** Client sex — null/absent = not specified. */
export const CLIENT_SEXES = ["female", "male"] as const;
export const ClientSex = z.enum(CLIENT_SEXES);
export type ClientSex = z.infer<typeof ClientSex>;

/** Weekly cardio target units — one fixed progress formula per unit (cardio.ts). */
export const CARDIO_TARGET_UNITS = ["minutes", "sessions", "zone_minutes"] as const;
export const CardioTargetUnit = z.enum(CARDIO_TARGET_UNITS);
export type CardioTargetUnit = z.infer<typeof CardioTargetUnit>;
export const CardioTarget = z.object({
  unit: CardioTargetUnit,
  value: z.number().int().min(1).max(10000),
});
export type CardioTarget = z.infer<typeof CardioTarget>;

/** A client's tested or trusted 1RM for one exercise, with the day it was set. */
export const OneRepMax = z.object({
  kg: z.number().positive().max(600),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});
export type OneRepMax = z.infer<typeof OneRepMax>;
/** exerciseId → 1RM. Drives %1RM prescriptions (load.ts `resolveLoadKg`). */
export const OneRepMaxes = z.record(z.string().min(1), OneRepMax);
export type OneRepMaxes = z.infer<typeof OneRepMaxes>;

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
  /** Lifting sessions per week the client can commit to (cardio does not count). */
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
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
  /** ISO weekdays the client can run / do cardio; null/absent = trainingDays.
   *  Cardio may go on these or on trainingDays (placement.ts). */
  cardioDays: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .refine((days) => new Set(days).size === days.length, {
      message: "cardioDays must be unique",
    })
    .nullable()
    .optional(),
  /** ISO weekday the long run is pinned to; null/absent = placer decides. */
  longRunDay: z.number().int().min(1).max(7).nullable().optional(),
  /** Current 1RMs per exercise; null/absent = none recorded. */
  oneRepMaxes: OneRepMaxes.nullable().optional(),
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
 * The label on a program exercise: what the trainer emphasizes with it in the
 * session. Built-in keys, in their default order. Labels come from three
 * categories — priority (Primary, Secondary, Auxiliary), training quality
 * (Power, Strength) and body region (Core). Secondary and Strength are two
 * different labels. "core" here is the body-region label, not the `core`
 * muscle group. Trainers add their own labels (`label:<uuid>`, roles.ts).
 */
export const EXERCISE_ROLES = ["power", "primary", "secondary", "strength", "accessory", "core"] as const;
export const BuiltinRole = z.enum(EXERCISE_ROLES);
export type BuiltinRole = z.infer<typeof BuiltinRole>;

/** Prefix of a trainer label's role value: `label:<uuid>`. */
export const CUSTOM_ROLE_PREFIX = "label:";
export const CustomRole = z.templateLiteral([CUSTOM_ROLE_PREFIX, z.uuid()]);
export type CustomRole = z.infer<typeof CustomRole>;
/** A built-in key or `label:<uuid>` (a trainer's own label). */
export const ExerciseRole = z.union([BuiltinRole, CustomRole]);
export type ExerciseRole = z.infer<typeof ExerciseRole>;
export const isBuiltinRole = (r: unknown): r is BuiltinRole =>
  typeof r === "string" && (EXERCISE_ROLES as readonly string[]).includes(r);
export const customRoleKey = (id: string): CustomRole => `${CUSTOM_ROLE_PREFIX}${id}` as CustomRole;

export const ROLE_CATEGORIES = ["priority", "quality", "region"] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export const ROLE_CATEGORY_NAMES: Record<RoleCategory, string> = {
  priority: "Priority",
  quality: "Training quality",
  region: "Body region",
};

/** Name (pickers), chip (the trainer's shorthand), category, default rank and
 *  meaning per built-in label; the meaning is also fed to the AI prompt. */
export const EXERCISE_ROLE_INFO: Record<
  BuiltinRole,
  { name: string; chip: string; category: RoleCategory; rank: number; description: string }
> = {
  power: {
    name: "Power",
    chip: "Power",
    category: "quality",
    rank: 100,
    description: "Explosive, low-rep work done fresh — jumps, throws, Olympic lift variations.",
  },
  primary: {
    name: "Primary",
    chip: "Primary",
    category: "priority",
    rank: 200,
    description: "The main lift the session is built around.",
  },
  secondary: {
    name: "Secondary",
    chip: "Secondary",
    category: "priority",
    rank: 300,
    description: "The second-priority lift of the session.",
  },
  strength: {
    name: "Strength",
    chip: "Str",
    category: "quality",
    rank: 400,
    description: "Work for maximal force — heavy loads, low to moderate reps.",
  },
  accessory: {
    name: "Auxiliary",
    chip: "Aux",
    category: "priority",
    rank: 500,
    description: "Assistance work — isolation, weak points, balance, usually higher reps.",
  },
  core: {
    name: "Core",
    chip: "Core",
    category: "region",
    rank: 600,
    description: "Trunk and anti-movement work, typically closing the session.",
  },
};

/** Rank lookup for sorting — a merged label list (roles.ts) or the built-in defaults. */
export interface RoleRank {
  key: string;
  rank: number;
  archived?: boolean;
}

/**
 * Stable sort by label rank (built-ins + the trainer's labels). Exercises
 * without a role, with an unknown label or an archived one keep their
 * relative order at the end.
 */
export function sortExercisesByRole<T extends { role?: string | null }>(
  list: readonly T[],
  labels?: readonly RoleRank[]
): T[] {
  const ranks = new Map<string, number>(
    labels
      ? labels.filter((l) => !l.archived).map((l) => [l.key, l.rank])
      : EXERCISE_ROLES.map((r) => [r, EXERCISE_ROLE_INFO[r].rank])
  );
  const rank = (r: string | null | undefined) => (r ? (ranks.get(r) ?? Infinity) : Infinity);
  return [...list].sort((a, b) => {
    const ra = rank(a.role);
    const rb = rank(b.role);
    return ra === rb ? 0 : ra - rb;
  });
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
  const parts = (["push", "pull", "knee", "hip", "core"] as const).filter((k) => b[k] > 0).map((k) => `${k} ${b[k]}`);
  if (b.unclassified > 0) parts.push(`${b.unclassified} untagged`);
  return parts.length ? parts.join(" · ") : "no exercises";
}

/** Four tempo phases, each a digit (seconds) or X (explosive): "3-1-1-0" or "31X0". */
export const TEMPO_PATTERN = /^(?:[0-9xX](?:-[0-9xX]){3}|[0-9xX]{4})$/;

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
    /** Load as a % of the client's 1RM for this exercise (resolved by `resolveLoadKg`).
     *  When the client has that 1RM it wins over `targetWeightKg` (the fallback). */
    percent1rm: z.number().min(1).max(110).optional(),
    /** Target rate of perceived exertion, 1–10. With `targetRpeMin`, the range's upper bound. */
    targetRpe: z.number().min(1).max(10).optional(),
    /** Lower bound of an RPE range (e.g. 7–8). */
    targetRpeMin: z.number().min(1).max(10).optional(),
    /** Reps in reserve, 0–10. */
    targetRir: z.number().min(0).max(10).optional(),
    /** Tempo: eccentric, bottom pause, concentric, top pause — "3-1-1-0" or "31X0" (X = explosive). */
    tempo: z.string().regex(TEMPO_PATTERN, "tempo must be 4 phases, e.g. 3-1-1-0 or 31X0").optional(),
    /** AMRAP only: stop the set at this RPE instead of going to failure. */
    stopRpe: z.number().min(1).max(10).optional(),
    /** Planned rest after this set, in seconds. */
    restSeconds: z.number().int().min(0).max(600).optional(),
  })
  .refine((s) => s.reps > 0 || s.amrap || s.durationSeconds !== undefined, {
    message: "reps 0 requires amrap (failure set) or durationSeconds (timed set)",
  })
  .refine((s) => s.repsMin === undefined || s.repsMin <= s.reps, {
    message: "repsMin must be ≤ reps (reps is the range's upper bound)",
  })
  .refine((s) => s.targetRpeMin === undefined || (s.targetRpe !== undefined && s.targetRpeMin <= s.targetRpe), {
    message: "targetRpeMin needs targetRpe and must be ≤ it (targetRpe is the range's upper bound)",
    path: ["targetRpeMin"],
  })
  .refine((s) => s.stopRpe === undefined || s.amrap, {
    message: "stopRpe is for AMRAP sets only",
    path: ["stopRpe"],
  });
export type PrescribedSet = z.infer<typeof PrescribedSet>;

export const ProgramExercise = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  /**
   * Display name captured at write time (catalog name, custom-exercise name,
   * or draft name). Programs render it directly — no catalog join on read.
   */
  exerciseName: z.string().min(1).max(200).optional(),
  /** Label: a built-in key or `label:<uuid>`. Absent on programs written before roles existed. */
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
    id: z.string().min(1),
    name: z.string().min(1).max(160),
    /** Position on its track ("Session N" / "Cardio N"), 1-based, unique per kind
     *  within a week and stable across weeks — the session's identity. */
    seq: z.number().int().min(1).max(14),
    /** Calendar placement, ISO 1=Mon…7=Sun; null/absent = unscheduled ("any day"). */
    weekday: z.number().int().min(1).max(7).nullable().optional(),
    /** 0-indexed order among the sessions placed on the same weekday. */
    order: z.number().int().min(0),
    kind: SessionKind.default("lifting"),
    /** Trainer's session type (see sessionTypes.ts); the name is captured at write time like exerciseName. */
    typeId: z.string().min(1).max(64).optional(),
    typeName: z.string().min(1).max(40).optional(),
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

export const MAX_SESSIONS_PER_WEEKDAY = 4;

/** A week = a set of sessions, each placed on a weekday (or unscheduled). */
export const ProgramWeek = z
  .object({
    week: z.number().int().min(1).max(26),
    sessions: z.array(ProgramSession).min(1).max(14),
  })
  .superRefine((w, ctx) => {
    const keys = new Set<string>();
    const perDay = new Map<number, number>();
    w.sessions.forEach((s, i) => {
      const key = sessionKey(s);
      if (keys.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate session ${key}`, path: ["sessions", i, "seq"] });
      }
      keys.add(key);
      if (s.weekday != null) perDay.set(s.weekday, (perDay.get(s.weekday) ?? 0) + 1);
    });
    for (const [d, n] of perDay) {
      if (n > MAX_SESSIONS_PER_WEEKDAY) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `weekday ${d} has ${n} sessions (max ${MAX_SESSIONS_PER_WEEKDAY})`, path: ["sessions"] });
      }
    }
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

/** Identity of a session within a week, stable across weeks: "lifting:2", "cardio:1". */
export function sessionKey(s: Pick<ProgramSession, "kind" | "seq">): string {
  return `${s.kind}:${s.seq}`;
}

/** Track label: "Session 2" / "Cardio 1". */
export function sessionTag(s: Pick<ProgramSession, "kind" | "seq">): string {
  return `${s.kind === "cardio" ? "Cardio" : "Session"} ${s.seq}`;
}

/** Programming order: lifting track then cardio track, each by seq. */
export function sessionsInSeqOrder<T extends Pick<ProgramSession, "kind" | "seq">>(sessions: readonly T[]): T[] {
  const rank = (s: T) => (s.kind === "cardio" ? 100 : 0) + s.seq;
  return [...sessions].sort((a, b) => rank(a) - rank(b));
}

/** Sessions grouped by weekday (1–7) in within-day order; key 0 = unscheduled. */
export function sessionsByWeekday<T extends Pick<ProgramSession, "weekday" | "order" | "kind" | "seq">>(
  sessions: readonly T[]
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (let d = 0; d <= 7; d++) out.set(d, []);
  for (const s of sessionsInSeqOrder(sessions)) out.get(s.weekday ?? 0)!.push(s);
  for (const list of out.values()) list.sort((a, b) => a.order - b.order);
  return out;
}

/** Distinct weekdays with at least one session placed. */
export function placedWeekdays(sessions: readonly Pick<ProgramSession, "weekday">[]): number[] {
  return [...new Set(sessions.flatMap((s) => (s.weekday != null ? [s.weekday] : [])))].sort((a, b) => a - b);
}

/** Copy a one-week session template into every week 1..plannedWeeks, fresh
 *  session/exercise ids per week (seq, placement and catalog refs kept). */
export function stampWeeks(template: ProgramSession[], plannedWeeks: number): ProgramWeek[] {
  const weeks: ProgramWeek[] = [];
  for (let w = 1; w <= plannedWeeks; w++) {
    weeks.push({
      week: w,
      sessions: template.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        exercises: s.exercises.map((e) => ({ ...e, id: crypto.randomUUID() })),
      })),
    });
  }
  return weeks;
}

/** Deep-copy program weeks with fresh session/exercise ids; catalog
 *  exerciseId refs, seq, placement, roles, sets and week numbers are kept. Pure. */
export function cloneProgramWeeks(weeks: ProgramWeek[]): ProgramWeek[] {
  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      exercises: s.exercises.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        prescribedSets: e.prescribedSets.map((ps) => ({ ...ps })),
      })),
    })),
  }));
}

/** All sessions of one week in programming order (empty when the week has no doc). */
export function weekSessions(weeks: ProgramWeek[], week: number): ProgramSession[] {
  const found = weeks.find((w) => w.week === week);
  return found ? sessionsInSeqOrder(found.sessions) : [];
}

/**
 * Convert a pre-redesign week (`days[]` of `{day, weekday, sessions[]}`) to the
 * flat shape. Day order sets each track's seq; a day's weekday becomes each of
 * its sessions' placement (null stays unscheduled); order within a weekday
 * continues across days that share it. Session ids are kept so logs stay linked.
 * Already-flat weeks pass through. Pure.
 */
export function migrateLegacyWeek(w: any): ProgramWeek {
  if (!Array.isArray(w?.days)) return w as ProgramWeek;
  const seq = { lifting: 0, cardio: 0 };
  const used = new Map<number, number>();
  const days = [...w.days].sort((a: any, b: any) => (a.day ?? 0) - (b.day ?? 0));
  const sessions: ProgramSession[] = [];
  for (const d of days) {
    const list = [...(d.sessions ?? [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    for (const s of list) {
      const kind: SessionKind = s.kind === "cardio" ? "cardio" : "lifting";
      const weekday: number | null = d.weekday ?? null;
      const slot = weekday ?? 0;
      const order = used.get(slot) ?? 0;
      used.set(slot, order + 1);
      sessions.push({ ...s, kind, seq: ++seq[kind], weekday, order });
    }
  }
  const { days: _days, ...rest } = w;
  return { ...rest, sessions };
}

// ---------------------------------------------------------------------------
// Program editing (pure)
// ---------------------------------------------------------------------------

export function newSet(over?: Partial<PrescribedSet>): PrescribedSet {
  return {
    setNumber: 1,
    type: "working",
    reps: 8,
    amrap: false,
    targetRpe: 8,
    restSeconds: 150,
    ...over,
  };
}

export function defaultCardio(): CardioPrescription {
  return {
    modality: "",
    durationMin: 30,
    hrZone: 2,
    intensity: "",
    distanceKm: undefined,
    targetRpe: undefined,
  };
}

export function addExercise(
  s: ProgramSession,
  exerciseId: string,
  exerciseName: string
): ProgramSession {
  const len = s.exercises.length;
  const newEx: ProgramExercise = {
    id: crypto.randomUUID(),
    exerciseId,
    exerciseName,
    order: len,
    prescribedSets: [],
  };
  const exercises = [...s.exercises, newEx].map((e, i) => ({
    ...e,
    order: i,
  }));
  return { ...s, exercises };
}

export function removeExercise(s: ProgramSession, index: number): ProgramSession {
  if (index < 0 || index >= s.exercises.length) return s;
  const exercises = s.exercises
    .filter((_, i) => i !== index)
    .map((e, i) => ({ ...e, order: i }));
  return { ...s, exercises };
}

export function moveExercise(
  s: ProgramSession,
  from: number,
  to: number
): ProgramSession {
  if (
    from < 0 ||
    from >= s.exercises.length ||
    to < 0 ||
    to >= s.exercises.length ||
    from === to
  ) {
    return s;
  }
  const next = [...s.exercises];
  const temp = next[from];
  next[from] = next[to];
  next[to] = temp;
  return {
    ...s,
    exercises: next.map((e, i) => ({ ...e, order: i })),
  };
}

export function addSet(e: ProgramExercise, type?: SetType): ProgramExercise {
  const next = newSet({
    ...(type ? { type } : {}),
    setNumber: e.prescribedSets.length + 1,
  });
  const prescribedSets = [...e.prescribedSets, next].map((s, i) => ({
    ...s,
    setNumber: i + 1,
  }));
  return { ...e, prescribedSets };
}

export function removeSet(e: ProgramExercise, index: number): ProgramExercise {
  if (index < 0 || index >= e.prescribedSets.length) return e;
  const prescribedSets = e.prescribedSets
    .filter((_, i) => i !== index)
    .map((s, i) => ({ ...s, setNumber: i + 1 }));
  return { ...e, prescribedSets };
}

/** Next free seq on a kind's track (gaps are not reused, so identity never shifts). */
export function nextSeq(sessions: readonly Pick<ProgramSession, "kind" | "seq">[], kind: SessionKind): number {
  return Math.max(0, ...sessions.filter((s) => s.kind === kind).map((s) => s.seq)) + 1;
}

/** Append a new session at the end of `weekday` (null = unscheduled). */
export function addSession(w: ProgramWeek, kind: SessionKind = "lifting", weekday: number | null = null): ProgramWeek {
  const seq = nextSeq(w.sessions, kind);
  const order = w.sessions.filter((s) => (s.weekday ?? null) === weekday).length;
  const s: ProgramSession = {
    id: crypto.randomUUID(),
    name: kind === "cardio" ? `Cardio ${seq}` : `Session ${seq}`,
    seq,
    weekday,
    order,
    kind,
    exercises: [],
    cardio: kind === "cardio" ? defaultCardio() : null,
  };
  return { ...w, sessions: [...w.sessions, s] };
}

/** Rewrite within-day order to 0..n-1 for every weekday. */
function compactOrder(sessions: ProgramSession[]): ProgramSession[] {
  const next = new Map<number, number>();
  const ranked = [...sessions].sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.order - b.order);
  const orderOf = new Map<string, number>();
  for (const s of ranked) {
    const d = s.weekday ?? 0;
    const o = next.get(d) ?? 0;
    orderOf.set(s.id, o);
    next.set(d, o + 1);
  }
  return sessions.map((s) => ({ ...s, order: orderOf.get(s.id)! }));
}

export function removeSession(w: ProgramWeek, id: string): ProgramWeek {
  return { ...w, sessions: compactOrder(w.sessions.filter((s) => s.id !== id)) };
}

/**
 * Place a session on `weekday` (null = unscheduled) at `index` within that day.
 * Placement only — the session's content and seq are untouched.
 */
export function placeSession(w: ProgramWeek, id: string, weekday: number | null, index: number): ProgramWeek {
  const moving = w.sessions.find((s) => s.id === id);
  if (!moving) return w;
  const target = sessionsByWeekday(w.sessions.filter((s) => s.id !== id)).get(weekday ?? 0)!;
  const at = Math.max(0, Math.min(index, target.length));
  const reordered = [...target.slice(0, at), { ...moving, weekday }, ...target.slice(at)];
  const placed = new Map(reordered.map((s, i) => [s.id, { ...s, weekday, order: i }]));
  const sessions = w.sessions.map((s) => placed.get(s.id) ?? s);
  return { ...w, sessions: compactOrder(sessions) };
}

/** Copy week `from`'s placement (by session key) onto every other week. Content untouched;
 *  sessions with no match in `from` keep their own placement. */
export function applyPlacementToAllWeeks(weeks: ProgramWeek[], from: number): ProgramWeek[] {
  const src = weeks.find((w) => w.week === from);
  if (!src) return weeks;
  const at = new Map(src.sessions.map((s) => [sessionKey(s), { weekday: s.weekday ?? null, order: s.order }]));
  return weeks.map((w) =>
    w.week === from
      ? w
      : { ...w, sessions: compactOrder(w.sessions.map((s) => ({ ...s, ...(at.get(sessionKey(s)) ?? {}) }))) }
  );
}

/** Switch a session's kind. Pass `seq` (from `nextSeq` on the new kind's track)
 *  when the session lives in a week, so its key stays unique. */
export function switchSessionKind(
  s: ProgramSession,
  kind: SessionKind,
  seq: number = s.seq
): ProgramSession {
  if (kind === s.kind) return s;
  if (kind === "cardio") {
    return { ...s, kind: "cardio", seq, exercises: [], cardio: defaultCardio() };
  }
  return { ...s, kind: "lifting", seq, cardio: null };
}

export function setRepsRange(
  ps: PrescribedSet,
  min: number | null,
  max: number
): PrescribedSet {
  const clampedMax = Math.min(100, Math.max(1, Math.round(max)));
  if (ps.amrap || ps.durationSeconds != null) {
    return { ...ps, reps: clampedMax };
  }
  if (min != null && min < clampedMax) {
    const clampedMin = Math.max(0, Math.round(min));
    return { ...ps, reps: clampedMax, repsMin: clampedMin };
  }
  return { ...ps, reps: clampedMax, repsMin: undefined };
}

export function setAmrap(ps: PrescribedSet, on: boolean): PrescribedSet {
  if (on) {
    return {
      ...ps,
      amrap: true,
      repsMin: undefined,
    };
  }
  return {
    ...ps,
    amrap: false,
  };
}

export function setTimed(
  ps: PrescribedSet,
  seconds: number | null
): PrescribedSet {
  if (seconds != null && seconds >= 1) {
    return {
      ...ps,
      durationSeconds: Math.round(seconds),
      repsMin: undefined,
    };
  }
  return {
    ...ps,
    durationSeconds: undefined,
  };
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

export const PROGRESSION_KINDS = ["kg", "percent", "sets"] as const;
export const ProgressionKind = z.enum(PROGRESSION_KINDS);
export type ProgressionKind = z.infer<typeof ProgressionKind>;

/** How a week's prescriptions change vs the week before (progression.ts):
 *  kg → add to kg targets; percent → add %1RM points (scale kg-only targets);
 *  sets → add/remove working sets per exercise. */
export const WeekProgression = z
  .object({
    kind: ProgressionKind,
    amount: z.number().min(-50).max(50),
  })
  .refine((p) => p.amount !== 0, { message: "progression amount must not be 0", path: ["amount"] })
  .refine((p) => p.kind !== "sets" || Number.isInteger(p.amount), {
    message: "a sets progression adds whole sets",
    path: ["amount"],
  });
export type WeekProgression = z.infer<typeof WeekProgression>;

/** One week of a periodization scheme: what this week should do. */
export const WeekPlan = z.object({
  week: z.number().int().min(1).max(26),
  directive: WeekDirective,
  target: WeekTarget.optional(),
  /** Rule that generates this week's prescriptions from the week before ("Apply progression"). */
  progression: WeekProgression.optional(),
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
  direction: z.string().max(500).nullable().optional(),
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
