import type { ClientDto, ExerciseDto, PeriodizationSchemeDto, ProgramDto, SessionLogInput } from "../types";
import type { SetType } from "@pt/shared";

export const schemes: PeriodizationSchemeDto[] = [
  {
    id: "sch-6wave",
    name: "6-week wave (coach's own)",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+intensity" },
      { week: 4, directive: "+volume" },
      { week: 5, directive: "transition" },
      { week: 6, directive: "transition" },
    ],
  },
  {
    id: "sch-4wave",
    name: "4-week wave",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+intensity" },
      { week: 4, directive: "deload" },
    ],
  },
  {
    id: "sch-31",
    name: "3:1 block",
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+volume" },
      { week: 4, directive: "deload" },
    ],
  },
];

const uuid = () => crypto.randomUUID();

export const exercises: ExerciseDto[] = [
  { id: "ex-squat", name: "Back Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes", "core"], equipment: "barbell" },
  { id: "ex-bench", name: "Bench Press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps", "shoulders"], equipment: "barbell" },
  { id: "ex-row", name: "Barbell Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "barbell" },
  { id: "ex-rdl", name: "Romanian Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: ["glutes", "back"], equipment: "barbell" },
  { id: "ex-dead", name: "Deadlift", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: ["back", "quads"], equipment: "barbell" },
  { id: "ex-pulldown", name: "Lat Pulldown", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable" },
  { id: "ex-ohp", name: "Overhead Press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell" },
  { id: "ex-landmine", name: "Landmine Press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["chest"], equipment: "barbell" },
  { id: "ex-bss", name: "Bulgarian Split Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "dumbbell" },
  { id: "ex-incline", name: "Incline Dumbbell Press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["shoulders"], equipment: "dumbbell" },
  { id: "ex-crow", name: "Seated Cable Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable" },
  { id: "ex-facepull", name: "Face Pull", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["back"], equipment: "cable" },
  { id: "ex-plank", name: "Plank", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-hlr", name: "Hanging Leg Raise", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-chin", name: "Chin-up", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "bodyweight" },
  { id: "ex-split", name: "Split Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "bodyweight" },
  { id: "ex-hinge", name: "Dumbbell Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "dumbbell" },
  { id: "ex-press", name: "Leg Press", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "machine" },
  { id: "ex-curl", name: "Dumbbell Curl", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "dumbbell" },
  { id: "ex-ext", name: "Cable Triceps Extension", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable" },
];

export const clients: ClientDto[] = [
  {
    id: "cl-maya",
    name: "Maya Chen",
    email: "maya.chen@example.com",
    status: "active",
    goals: "First unassisted pull-up and a 60 kg back squat by December.",
    limitations: "Right shoulder impingement — no barbell overhead pressing, no behind-neck work.",
    daysPerWeek: 4,
    trainingDays: [1, 2, 4, 5],
  },
  {
    id: "cl-jonas",
    name: "Jonas Weber",
    email: "jonas.weber@example.com",
    status: "active",
    goals: "Lean bulk to 80 kg bodyweight, keep visible abs.",
    limitations: null,
    daysPerWeek: 3,
    trainingDays: [2, 4, 6],
  },
  {
    id: "cl-priya",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    status: "paused",
    goals: "General strength, twice a week is all I can commit to.",
    limitations: "Old left ankle sprain — avoid high-impact jumping.",
    daysPerWeek: 2,
    trainingDays: [3, 5],
  },
];

const S = (setNumber: number, reps: number, extra: Partial<ProgramDto["sessions"][0]["exercises"][0]["prescribedSets"][0]> = {}) => ({
  setNumber,
  type: "working" as const,
  reps,
  amrap: false,
  ...extra,
});

export const programs: ProgramDto[] = [
  {
    id: "pg-maya-a",
    clientId: "cl-maya",
    name: "Strength Base A",
    description: "Full-body strength base, 4 days. Neutral-grip pressing only.",
    status: "active",
    version: 3,
    aiAssisted: false,
    createdFromProgramId: null,
    createdAt: "2026-07-14T09:00:00Z",
    activatedAt: new Date(Date.now() - 19 * 86400_000).toISOString(),
    phasing: {
      plannedWeeks: 4,
      phase: "accumulation",
      nextPhase: "deload → intensification",
      deloadWeeks: [4],
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "deload" },
      ],
    },
    sessions: [
      {
        id: "ps-maya-1",
        name: "Day 1 — Lower",
        order: 0,
        exercises: [
          { id: "pe-maya-1", exerciseId: "ex-squat", role: "primary", order: 0, prescribedSets: [S(1, 5, { targetRpe: 8, restSeconds: 180 }), S(2, 5, { targetRpe: 8, restSeconds: 180 }), S(3, 5, { amrap: true, targetRpe: 9, restSeconds: 180 })], notes: "2s pause in the hole on last set" },
          { id: "pe-maya-2", exerciseId: "ex-rdl", role: "strength", order: 1, prescribedSets: [S(1, 8, { targetRpe: 7, restSeconds: 120 }), S(2, 8, { targetRpe: 7, restSeconds: 120 }), S(3, 8, { targetRpe: 7, restSeconds: 120 })] },
          { id: "pe-maya-3", exerciseId: "ex-plank", role: "core", order: 2, prescribedSets: [S(1, 45, { restSeconds: 60 }), S(2, 45, { restSeconds: 60 })], notes: "45s holds" },
        ],
      },
      {
        id: "ps-maya-2",
        name: "Day 2 — Upper",
        order: 1,
        exercises: [
          { id: "pe-maya-4", exerciseId: "ex-landmine", role: "primary", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { targetRpe: 8, restSeconds: 120 })], notes: "Shoulder-friendly pressing slot" },
          { id: "pe-maya-5", exerciseId: "ex-pulldown", role: "strength", order: 1, prescribedSets: [S(1, 10, { targetRpe: 8, restSeconds: 90 }), S(2, 10, { targetRpe: 8, restSeconds: 90 }), S(3, 10, { amrap: true, targetRpe: 9, restSeconds: 90 })] },
          { id: "pe-maya-6", exerciseId: "ex-facepull", role: "accessory", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 }), S(3, 15, { restSeconds: 60 })] },
        ],
      },
      {
        id: "ps-maya-3",
        name: "Day 3 — Lower",
        order: 2,
        exercises: [
          { id: "pe-maya-7", exerciseId: "ex-dead", role: "primary", order: 0, prescribedSets: [S(1, 5, { targetRpe: 8, restSeconds: 210 }), S(2, 5, { targetRpe: 8, restSeconds: 210 })] },
          { id: "pe-maya-8", exerciseId: "ex-bss", role: "strength", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 90 }), S(2, 10, { targetRpe: 7, restSeconds: 90 }), S(3, 10, { targetRpe: 7, restSeconds: 90 })] },
          { id: "pe-maya-9", exerciseId: "ex-hlr", role: "core", order: 2, prescribedSets: [S(1, 10, { restSeconds: 60 }), S(2, 10, { restSeconds: 60 }), S(3, 10, { restSeconds: 60 })] },
        ],
      },
      {
        id: "ps-maya-4",
        name: "Day 4 — Upper",
        order: 3,
        exercises: [
          { id: "pe-maya-10", exerciseId: "ex-incline", role: "primary", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { amrap: true, targetRpe: 9, restSeconds: 120 })] },
          { id: "pe-maya-11", exerciseId: "ex-crow", role: "strength", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] },
          { id: "pe-maya-12", exerciseId: "ex-chin", role: "strength", order: 2, prescribedSets: [S(1, 6, { amrap: true, targetRpe: 9, restSeconds: 120 }), S(2, 6, { amrap: true, targetRpe: 9, restSeconds: 120 })], notes: "Band-assisted, reduce band when 8+ reps" },
          { id: "pe-maya-13", exerciseId: "ex-curl", role: "accessory", order: 3, prescribedSets: [S(1, 12, { restSeconds: 60 }), S(2, 12, { restSeconds: 60 })] },
        ],
      },
    ],
  },
  {
    id: "pg-maya-0",
    clientId: "cl-maya",
    name: "Onboarding Intro",
    description: "Two weeks of technique work.",
    status: "archived",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    createdAt: "2026-06-30T09:00:00Z",
    sessions: [
      { id: "ps-maya-i1", name: "Full body A", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-split", order: 0, prescribedSets: [S(1, 10), S(2, 10), S(3, 10)] }, { id: uuid(), exerciseId: "ex-hinge", order: 1, prescribedSets: [S(1, 12), S(2, 12)] }] },
      { id: "ps-maya-i2", name: "Full body B", order: 1, exercises: [{ id: uuid(), exerciseId: "ex-press", order: 0, prescribedSets: [S(1, 12), S(2, 12)] }] },
    ],
  },
  {
    id: "pg-jonas-a",
    clientId: "cl-jonas",
    name: "Hypertrophy Block 2",
    description: "3-day upper/lower/upper split, 8–12 rep focus.",
    status: "active",
    version: 2,
    aiAssisted: true,
    createdFromProgramId: "pg-jonas-0",
    createdAt: "2026-08-02T09:00:00Z",
    activatedAt: new Date(Date.now() - 12 * 86400_000).toISOString(),
    phasing: {
      plannedWeeks: 6,
      phase: "hypertrophy",
      nextPhase: "deload",
      deloadWeeks: [6],
      weeks: [
        { week: 1, directive: "base" },
        { week: 2, directive: "+volume" },
        { week: 3, directive: "+intensity" },
        { week: 4, directive: "+volume" },
        { week: 5, directive: "transition" },
        { week: 6, directive: "transition" },
      ],
    },
    sessions: [
      { id: "ps-jonas-1", name: "Upper A", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-bench", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 150 }), S(2, 8, { targetRpe: 8, restSeconds: 150 }), S(3, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] }, { id: uuid(), exerciseId: "ex-ext", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 })] }] },
      { id: "ps-jonas-2", name: "Lower", order: 1, exercises: [{ id: uuid(), exerciseId: "ex-squat", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 150 }), S(2, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-rdl", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 120 }), S(2, 10, { targetRpe: 7, restSeconds: 120 })] }] },
      { id: "ps-jonas-3", name: "Upper B", order: 2, exercises: [{ id: uuid(), exerciseId: "ex-incline", order: 0, prescribedSets: [S(1, 10, { targetRpe: 8, restSeconds: 120 }), S(2, 10, { targetRpe: 8, restSeconds: 120 })] }, { id: uuid(), exerciseId: "ex-pulldown", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 })] }] },
    ],
  },
  {
    id: "pg-jonas-0",
    clientId: "cl-jonas",
    name: "Hypertrophy Block 1",
    description: null,
    status: "archived",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    createdAt: "2026-06-15T09:00:00Z",
    sessions: [{ id: uuid(), name: "Full body", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-bench", order: 0, prescribedSets: [S(1, 10), S(2, 10), S(3, 10)] }] }],
  },
  {
    id: "pg-priya-a",
    clientId: "cl-priya",
    name: "Maintain & Move",
    description: "2×/week, joint-friendly.",
    status: "draft",
    version: 1,
    aiAssisted: false,
    createdFromProgramId: null,
    createdAt: "2026-09-10T09:00:00Z",
    sessions: [{ id: uuid(), name: "Day 1", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-press", order: 0, prescribedSets: [S(1, 12), S(2, 12)] }, { id: uuid(), exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12), S(2, 12)] }] }],
  },
];

// Working-set load targets — what the coach prescribed for the current block
// (last logged progression + the next planned jump). Absent = bodyweight / RPE-driven.
const LOAD_TARGETS: Record<string, number> = {
  "ex-squat": 65,
  "ex-bench": 45,
  "ex-row": 55,
  "ex-rdl": 62.5,
  "ex-dead": 82.5,
  "ex-pulldown": 47.5,
  "ex-landmine": 35,
  "ex-incline": 22,
  "ex-crow": 45,
  "ex-bss": 20,
  "ex-press": 110,
  "ex-hinge": 26,
  "ex-curl": 12,
  "ex-ext": 25,
};
for (const p of programs) {
  for (const s of p.sessions) {
    for (const e of s.exercises) {
      const target = LOAD_TARGETS[e.exerciseId];
      if (!target) continue;
      for (const ps of e.prescribedSets) {
        if (ps.type === "working") ps.targetWeightKg = target;
      }
    }
  }
}

export interface StoredLog {
  sessionLogId: string;
  clientId: string;
  programId: string;
  date: string;
  perceivedEnergy?: number;
  notes?: string;
  sets: {
    exerciseId: string;
    setNumber: number;
    type: SetType;
    weightKg?: number;
    reps: number;
    rpe?: number;
  }[];
}

const day = (offset: number) =>
  new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);

/** 8 weeks of Maya's squat/landmine/pulldown/chin/RDL progress — the AI's fuel. */
export const logs: StoredLog[] = [
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(42), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 50, reps: 5, rpe: 7 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 50, reps: 5, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(35), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 52.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 52.5, reps: 4, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 30, reps: 8, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(28), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "working", weightKg: 55, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 55, reps: 5, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 41, reps: 10, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 2, type: "working", weightKg: 41, reps: 9, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(21), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 57.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 57.5, reps: 5, rpe: 9 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 57.5, reps: 6, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 1, type: "working", reps: 5, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 2, type: "working", reps: 4, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 32.5, reps: 8, rpe: 7 },
    { exerciseId: "ex-landmine", setNumber: 2, type: "working", weightKg: 32.5, reps: 8, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(14), perceivedEnergy: 9, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 57.5, reps: 5, rpe: 7 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 60, reps: 5, rpe: 9 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 45.5, reps: 10, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 2, type: "working", weightKg: 45.5, reps: 8, rpe: 9 },
    { exerciseId: "ex-rdl", setNumber: 1, type: "working", weightKg: 60, reps: 8, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(7), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 62.5, reps: 5, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 1, type: "working", reps: 6, rpe: 9 },
    { exerciseId: "ex-chin", setNumber: 2, type: "working", reps: 5, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 35, reps: 8, rpe: 8 },
    { exerciseId: "ex-landmine", setNumber: 2, type: "working", weightKg: 35, reps: 7, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(3), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 62.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 62.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 4, type: "working", weightKg: 62.5, reps: 7, rpe: 9 },
    { exerciseId: "ex-dead", setNumber: 2, type: "working", weightKg: 80, reps: 5, rpe: 8 },
    { exerciseId: "ex-pulldown", setNumber: 1, type: "working", weightKg: 50, reps: 10, rpe: 8 },
  ], notes: "Squat felt smooth, +2.5 on AMRAP." },
  { sessionLogId: uuid(), clientId: "cl-jonas", programId: "pg-jonas-a", date: day(5), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-bench", setNumber: 1, type: "working", weightKg: 70, reps: 8, rpe: 8 },
    { exerciseId: "ex-bench", setNumber: 2, type: "working", weightKg: 70, reps: 8, rpe: 8 },
    { exerciseId: "ex-crow", setNumber: 1, type: "working", weightKg: 55, reps: 12, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-jonas", programId: "pg-jonas-a", date: day(2), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 90, reps: 8, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 90, reps: 8, rpe: 9 },
    { exerciseId: "ex-rdl", setNumber: 1, type: "working", weightKg: 100, reps: 10, rpe: 7 },
  ]},
];

export const sessionLogInputs: SessionLogInput[] = [];

// ---------------------------------------------------------------------------
// Coach-supplied program (real format from the trainer's own programming):
// hypertrophy block with mobility prep, rep ranges, pyramids, timed work,
// failure sets and cardio prescriptions — plus the next strength block as draft.
// ---------------------------------------------------------------------------
export const trainerExercises: ExerciseDto[] = [
  { id: "ex-latstretch", name: "Lateral Stretch", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-scapdep", name: "Scapular Depression", primaryMuscleGroup: "lats", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-pullup", name: "Pull up (Power)", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "pull-up bar" },
  { id: "ex-sarow", name: "SA Row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "dumbbell" },
  { id: "ex-bentrow-sup", name: "Bent over row (Supinate)", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "barbell" },
  { id: "ex-lowrow", name: "Low row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "cable" },
  { id: "ex-bbcurl", name: "BB standing biceps", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "barbell" },
  { id: "ex-cheststretch", name: "Chest stretch (PAILs/RAILs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-cars", name: "Shoulder mobility (CARs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-extrot", name: "Shoulder external rotation", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: [], equipment: "band" },
  { id: "ex-cgmp", name: "Close grip Military press (Asymmetrical)", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell" },
  { id: "ex-dbbench", name: "DB Bench press", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "dumbbell" },
  { id: "ex-widechest", name: "Wide chest press", primaryMuscleGroup: "chest", secondaryMuscleGroups: [], equipment: "machine" },
  { id: "ex-ovhext", name: "Triceps OVH extension", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable" },
  { id: "ex-hipflex", name: "Hip flexor stretch (Static)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-hipcars", name: "Hip mobility (CARs)", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-kbdlsq", name: "KB Deadlift to Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "kettlebell" },
  { id: "ex-kbswing", name: "KB American Swing", primaryMuscleGroup: "glutes", secondaryMuscleGroups: ["hamstrings"], equipment: "kettlebell" },
  { id: "ex-frontsquat", name: "Front Squat", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["core"], equipment: "barbell" },
  { id: "ex-bblunge", name: "BB Static Lunge", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "barbell" },
  { id: "ex-hipthrust", name: "Hip thrust", primaryMuscleGroup: "glutes", secondaryMuscleGroups: ["hamstrings"], equipment: "barbell" },
  { id: "ex-deadbug", name: "Dead bug + Pullover", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-catcamel", name: "Cat camel", primaryMuscleGroup: "mobility", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-ropecrunch", name: "Rope crunch", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "cable" },
  { id: "ex-torsotwist", name: "MC Torso Twist", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "machine" },
  { id: "ex-sideplank", name: "Elbow side plank", primaryMuscleGroup: "core", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-pushpress", name: "Push press", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["triceps"], equipment: "barbell" },
  { id: "ex-kinesisincline", name: "Incline bench press (Kinesis)", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["shoulders"], equipment: "machine" },
  { id: "ex-crossover", name: "Crossover / Dip", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "cable" },
  { id: "ex-pushup", name: "Push up", primaryMuscleGroup: "chest", secondaryMuscleGroups: ["triceps"], equipment: "bodyweight" },
  { id: "ex-trirope", name: "Triceps rope push down", primaryMuscleGroup: "triceps", secondaryMuscleGroups: [], equipment: "cable" },
  { id: "ex-highpull", name: "Power high pull", primaryMuscleGroup: "back", secondaryMuscleGroups: ["shoulders"], equipment: "barbell" },
  { id: "ex-vbarrow", name: "V-bar row", primaryMuscleGroup: "back", secondaryMuscleGroups: ["biceps"], equipment: "machine" },
  { id: "ex-reardelt", name: "Rear delt row", primaryMuscleGroup: "shoulders", secondaryMuscleGroups: ["back"], equipment: "cable" },
  { id: "ex-invertrow", name: "Invert row", primaryMuscleGroup: "back", secondaryMuscleGroups: [], equipment: "bodyweight" },
  { id: "ex-ropetwist", name: "Biceps rope curl", primaryMuscleGroup: "biceps", secondaryMuscleGroups: [], equipment: "cable" },
  { id: "ex-walklunge", name: "Walking lunge", primaryMuscleGroup: "quads", secondaryMuscleGroups: ["glutes"], equipment: "bodyweight" },
  { id: "ex-legext", name: "Leg extensions", primaryMuscleGroup: "quads", secondaryMuscleGroups: [], equipment: "machine" },
  { id: "ex-legcurl", name: "Leg curl", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [], equipment: "machine" },
];
exercises.push(...trainerExercises);

export const trainerClient: ClientDto = {
  id: "cl-nat",
  name: "Nattapong W.",
  email: "nattapong@example.com",
  status: "active",
  goals: "Off-season: sarcoplasmic hypertrophy block, then strength interlude.",
  limitations: null,
  daysPerWeek: 4,
  trainingDays: [1, 2, 4, 6],
};
clients.push(trainerClient);

const many = (n: number, reps: number, extra: Partial<ProgramDto["sessions"][0]["exercises"][0]["prescribedSets"][0]> = {}) =>
  Array.from({ length: n }, (_, i) => S(i + 1, reps, extra));

const range = (n: number, min: number, max: number, extra: Partial<ProgramDto["sessions"][0]["exercises"][0]["prescribedSets"][0]> = {}) =>
  many(n, max, { repsMin: min, ...extra });

const timed = (n: number, seconds: number, extra: Partial<ProgramDto["sessions"][0]["exercises"][0]["prescribedSets"][0]> = {}) =>
  many(n, 0, { durationSeconds: seconds, ...extra });

const toFailure = (n: number) => many(n, 0, { amrap: true });

export const trainerProgram: ProgramDto = {
  id: "pg-nat-a",
  clientId: "cl-nat",
  name: "Sarcoplasmic Hypertrophy",
  description: "4 days + cardio. Rest day + easy run 1–2 days per week.",
  status: "active",
  version: 2,
  aiAssisted: false,
  createdFromProgramId: null,
  activatedAt: new Date(Date.now() - 6 * 86400_000).toISOString(),
  phasing: {
    plannedWeeks: 6,
    phase: "Sarcoplasmic hypertrophy",
    nextPhase: "Strength interlude",
    deloadWeeks: [6],
    weeks: [
      { week: 1, directive: "base" },
      { week: 2, directive: "+volume" },
      { week: 3, directive: "+intensity" },
      { week: 4, directive: "+volume" },
      { week: 5, directive: "transition" },
      { week: 6, directive: "transition" },
    ],
  },
  createdAt: new Date(Date.now() - 8 * 86400_000).toISOString(),
  sessions: [
    {
      id: "ps-nat-1", name: "Day 1 — Back / Biceps", order: 0,
      conditioning: { label: "Cardio Zone 2–3", detail: "40–60 min steady" },
      exercises: [
        { id: "pe-nat-1", exerciseId: "ex-latstretch", order: 0, prescribedSets: timed(2, 15), notes: "Static stretch" },
        { id: "pe-nat-2", exerciseId: "ex-scapdep", order: 1, prescribedSets: many(2, 10), notes: "1–2 sets" },
        { id: "pe-nat-3", exerciseId: "ex-pullup", order: 2, prescribedSets: many(3, 6), notes: "Power intent — move fast" },
        { id: "pe-nat-4", exerciseId: "ex-sarow", order: 3, prescribedSets: range(3, 6, 10) },
        { id: "pe-nat-5", exerciseId: "ex-bentrow-sup", order: 4, prescribedSets: many(5, 5), notes: "Supinate grip" },
        { id: "pe-nat-6", exerciseId: "ex-pulldown", order: 5, prescribedSets: [S(1, 10), S(2, 8), S(3, 6), S(4, 5)], notes: "Pyramid" },
        { id: "pe-nat-7", exerciseId: "ex-lowrow", order: 6, prescribedSets: [S(1, 10), S(2, 8), S(3, 6), S(4, 5)], notes: "Pyramid" },
        { id: "pe-nat-8", exerciseId: "ex-bbcurl", order: 7, prescribedSets: many(4, 12) },
      ],
    },
    {
      id: "ps-nat-2", name: "Day 2 — Chest / Triceps", order: 1,
      conditioning: { label: "Cardio Zone 1–2", detail: "Long run 10 km+" },
      exercises: [
        { id: "pe-nat-9", exerciseId: "ex-cheststretch", order: 0, prescribedSets: timed(2, 12), notes: "PAILs/RAILs" },
        { id: "pe-nat-10", exerciseId: "ex-cars", order: 1, prescribedSets: range(2, 3, 5), notes: "Rounds" },
        { id: "pe-nat-11", exerciseId: "ex-extrot", order: 2, prescribedSets: many(3, 10), notes: "2–3 sets" },
        { id: "pe-nat-12", exerciseId: "ex-cgmp", order: 3, prescribedSets: range(3, 6, 10), notes: "Asymmetrical load" },
        { id: "pe-nat-13", exerciseId: "ex-bench", order: 4, prescribedSets: many(4, 12) },
        { id: "pe-nat-14", exerciseId: "ex-incline", order: 5, prescribedSets: many(4, 12), notes: "45°" },
        { id: "pe-nat-15", exerciseId: "ex-widechest", order: 6, prescribedSets: many(4, 12) },
        { id: "pe-nat-16", exerciseId: "ex-ovhext", order: 7, prescribedSets: many(4, 12) },
      ],
    },
    {
      id: "ps-nat-3", name: "Day 3 — Lower", order: 2,
      conditioning: { label: "Cardio Zone 2–3", detail: "40–60 min steady" },
      exercises: [
        { id: "pe-nat-17", exerciseId: "ex-hipflex", order: 0, prescribedSets: timed(2, 12) },
        { id: "pe-nat-18", exerciseId: "ex-hipcars", order: 1, prescribedSets: range(2, 3, 5), notes: "Rounds" },
        { id: "pe-nat-19", exerciseId: "ex-kbdlsq", order: 2, prescribedSets: many(3, 10) },
        { id: "pe-nat-20", exerciseId: "ex-kbswing", order: 3, prescribedSets: timed(3, 60) },
        { id: "pe-nat-21", exerciseId: "ex-dead", order: 4, prescribedSets: many(4, 10) },
        { id: "pe-nat-22", exerciseId: "ex-frontsquat", order: 5, prescribedSets: many(4, 10) },
        { id: "pe-nat-23", exerciseId: "ex-bblunge", order: 6, prescribedSets: many(4, 10) },
        { id: "pe-nat-24", exerciseId: "ex-hipthrust", order: 7, prescribedSets: many(4, 10) },
      ],
    },
    {
      id: "ps-nat-4", name: "Day 4 — Core / VO2max", order: 3,
      conditioning: { label: "Cardio VO2max", detail: "Intervals 90%+, 1 : 3–5 — 20–30 min total (excl. warm-up)" },
      exercises: [
        { id: "pe-nat-25", exerciseId: "ex-deadbug", order: 0, prescribedSets: many(3, 12) },
        { id: "pe-nat-26", exerciseId: "ex-catcamel", order: 1, prescribedSets: many(3, 10) },
        { id: "pe-nat-27", exerciseId: "ex-ropecrunch", order: 2, prescribedSets: many(4, 12) },
        { id: "pe-nat-28", exerciseId: "ex-hlr", order: 3, prescribedSets: many(4, 12) },
        { id: "pe-nat-29", exerciseId: "ex-torsotwist", order: 4, prescribedSets: many(4, 10) },
        { id: "pe-nat-30", exerciseId: "ex-plank", order: 5, prescribedSets: toFailure(4) },
        { id: "pe-nat-31", exerciseId: "ex-sideplank", order: 6, prescribedSets: toFailure(4) },
      ],
    },
  ],
};
programs.push(trainerProgram);

export const trainerProgramDraft: ProgramDto = {
  ...trainerProgram,
  id: "pg-nat-b",
  name: "Strength Interlude",
  description: "Next block after the hypertrophy run — heavier, fewer reps.",
  status: "draft",
  version: 1,
  activatedAt: null,
  phasing: { plannedWeeks: 4, phase: "Myofibrillar strength", nextPhase: "Return to hypertrophy", deloadWeeks: [4] },
  createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  sessions: [
    {
      id: "ps-natb-1", name: "Day 1 — Upper Push", order: 0, conditioning: null,
      exercises: [
        { id: "pe-natb-1", exerciseId: "ex-pushpress", order: 0, prescribedSets: many(5, 6) },
        { id: "pe-natb-2", exerciseId: "ex-dbbench", order: 1, prescribedSets: range(4, 6, 8) },
        { id: "pe-natb-3", exerciseId: "ex-kinesisincline", order: 2, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-4", exerciseId: "ex-crossover", order: 3, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-5", exerciseId: "ex-pushup", order: 4, prescribedSets: toFailure(3) },
        { id: "pe-natb-6", exerciseId: "ex-trirope", order: 5, prescribedSets: range(3, 9, 12) },
      ],
    },
    {
      id: "ps-natb-2", name: "Day 2 — Upper Pull", order: 1, conditioning: null,
      exercises: [
        { id: "pe-natb-7", exerciseId: "ex-highpull", order: 0, prescribedSets: many(5, 6) },
        { id: "pe-natb-8", exerciseId: "ex-vbarrow", order: 1, prescribedSets: range(4, 6, 8) },
        { id: "pe-natb-9", exerciseId: "ex-pulldown", order: 2, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-10", exerciseId: "ex-reardelt", order: 3, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-11", exerciseId: "ex-invertrow", order: 4, prescribedSets: toFailure(3) },
        { id: "pe-natb-12", exerciseId: "ex-ropetwist", order: 5, prescribedSets: range(3, 9, 12) },
      ],
    },
    {
      id: "ps-natb-3", name: "Day 3 — Lower", order: 2, conditioning: null,
      exercises: [
        { id: "pe-natb-13", exerciseId: "ex-squat", order: 0, prescribedSets: range(4, 6, 8) },
        { id: "pe-natb-14", exerciseId: "ex-press", order: 1, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-15", exerciseId: "ex-walklunge", order: 2, prescribedSets: many(3, 20), notes: "Steps per set" },
        { id: "pe-natb-16", exerciseId: "ex-legext", order: 3, prescribedSets: range(3, 9, 12) },
        { id: "pe-natb-17", exerciseId: "ex-legcurl", order: 4, prescribedSets: range(3, 9, 12) },
      ],
    },
  ],
};
programs.push(trainerProgramDraft);

logs.push(
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(4), perceivedEnergy: 7, sets: [
    { exerciseId: "ex-pullup", setNumber: 1, type: "working", reps: 6, rpe: 7 },
    { exerciseId: "ex-pullup", setNumber: 2, type: "working", reps: 6, rpe: 8 },
    { exerciseId: "ex-pullup", setNumber: 3, type: "working", reps: 5, rpe: 8 },
    { exerciseId: "ex-bentrow-sup", setNumber: 1, type: "working", weightKg: 60, reps: 5, rpe: 7 },
    { exerciseId: "ex-bentrow-sup", setNumber: 2, type: "working", weightKg: 60, reps: 5, rpe: 8 },
    { exerciseId: "ex-bbcurl", setNumber: 1, type: "working", weightKg: 20, reps: 12, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(2), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-dead", setNumber: 1, type: "working", weightKg: 100, reps: 10, rpe: 7 },
    { exerciseId: "ex-dead", setNumber: 2, type: "working", weightKg: 100, reps: 10, rpe: 8 },
    { exerciseId: "ex-frontsquat", setNumber: 1, type: "working", weightKg: 70, reps: 10, rpe: 7 },
    { exerciseId: "ex-kbswing", setNumber: 1, type: "working", weightKg: 24, reps: 0, rpe: 6 },
  ], notes: "KB swings by the minute; DL grip gave out on set 3." },
  { sessionLogId: uuid(), clientId: "cl-nat", programId: "pg-nat-a", date: day(1), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-ropecrunch", setNumber: 1, type: "working", reps: 12, rpe: 7 },
    { exerciseId: "ex-hlr", setNumber: 1, type: "working", reps: 12, rpe: 8 },
    { exerciseId: "ex-plank", setNumber: 1, type: "working", reps: 0, rpe: 8 },
  ]},
);
