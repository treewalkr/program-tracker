import type { ClientDto, ExerciseDto, ProgramDto, SessionLogInput } from "../types";

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
  },
  {
    id: "cl-jonas",
    name: "Jonas Weber",
    email: "jonas.weber@example.com",
    status: "active",
    goals: "Lean bulk to 80 kg bodyweight, keep visible abs.",
    limitations: null,
    daysPerWeek: 3,
  },
  {
    id: "cl-priya",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    status: "paused",
    goals: "General strength, twice a week is all I can commit to.",
    limitations: "Old left ankle sprain — avoid high-impact jumping.",
    daysPerWeek: 2,
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
    sessions: [
      {
        id: "ps-maya-1",
        name: "Day 1 — Lower",
        order: 0,
        exercises: [
          { id: "pe-maya-1", exerciseId: "ex-squat", order: 0, prescribedSets: [S(1, 5, { type: "warm_up", restSeconds: 90 }), S(2, 5, { targetRpe: 8, restSeconds: 180 }), S(3, 5, { targetRpe: 8, restSeconds: 180 }), S(4, 5, { amrap: true, targetRpe: 9, restSeconds: 180 })], notes: "2s pause in the hole on last set" },
          { id: "pe-maya-2", exerciseId: "ex-rdl", order: 1, prescribedSets: [S(1, 8, { targetRpe: 7, restSeconds: 120 }), S(2, 8, { targetRpe: 7, restSeconds: 120 }), S(3, 8, { targetRpe: 7, restSeconds: 120 })] },
          { id: "pe-maya-3", exerciseId: "ex-plank", order: 2, prescribedSets: [S(1, 45, { restSeconds: 60 }), S(2, 45, { restSeconds: 60 })], notes: "45s holds" },
        ],
      },
      {
        id: "ps-maya-2",
        name: "Day 2 — Upper",
        order: 1,
        exercises: [
          { id: "pe-maya-4", exerciseId: "ex-landmine", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { targetRpe: 8, restSeconds: 120 })], notes: "Shoulder-friendly pressing slot" },
          { id: "pe-maya-5", exerciseId: "ex-pulldown", order: 1, prescribedSets: [S(1, 10, { targetRpe: 8, restSeconds: 90 }), S(2, 10, { targetRpe: 8, restSeconds: 90 }), S(3, 10, { amrap: true, targetRpe: 9, restSeconds: 90 })] },
          { id: "pe-maya-6", exerciseId: "ex-facepull", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 }), S(3, 15, { restSeconds: 60 })] },
        ],
      },
      {
        id: "ps-maya-3",
        name: "Day 3 — Lower",
        order: 2,
        exercises: [
          { id: "pe-maya-7", exerciseId: "ex-dead", order: 0, prescribedSets: [S(1, 3, { type: "warm_up", restSeconds: 120 }), S(2, 5, { targetRpe: 8, restSeconds: 210 }), S(3, 5, { targetRpe: 8, restSeconds: 210 })] },
          { id: "pe-maya-8", exerciseId: "ex-bss", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 90 }), S(2, 10, { targetRpe: 7, restSeconds: 90 }), S(3, 10, { targetRpe: 7, restSeconds: 90 })] },
          { id: "pe-maya-9", exerciseId: "ex-hlr", order: 2, prescribedSets: [S(1, 10, { restSeconds: 60 }), S(2, 10, { restSeconds: 60 }), S(3, 10, { restSeconds: 60 })] },
        ],
      },
      {
        id: "ps-maya-4",
        name: "Day 4 — Upper",
        order: 3,
        exercises: [
          { id: "pe-maya-10", exerciseId: "ex-incline", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 120 }), S(2, 8, { targetRpe: 8, restSeconds: 120 }), S(3, 8, { amrap: true, targetRpe: 9, restSeconds: 120 })] },
          { id: "pe-maya-11", exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] },
          { id: "pe-maya-12", exerciseId: "ex-chin", order: 2, prescribedSets: [S(1, 6, { amrap: true, targetRpe: 9, restSeconds: 120 }), S(2, 6, { amrap: true, targetRpe: 9, restSeconds: 120 })], notes: "Band-assisted, reduce band when 8+ reps" },
          { id: "pe-maya-13", exerciseId: "ex-curl", order: 3, prescribedSets: [S(1, 12, { restSeconds: 60 }), S(2, 12, { restSeconds: 60 })] },
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
    sessions: [
      { id: "ps-jonas-1", name: "Upper A", order: 0, exercises: [{ id: uuid(), exerciseId: "ex-bench", order: 0, prescribedSets: [S(1, 8, { targetRpe: 8, restSeconds: 150 }), S(2, 8, { targetRpe: 8, restSeconds: 150 }), S(3, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-crow", order: 1, prescribedSets: [S(1, 12, { targetRpe: 7, restSeconds: 90 }), S(2, 12, { targetRpe: 7, restSeconds: 90 }), S(3, 12, { targetRpe: 7, restSeconds: 90 })] }, { id: uuid(), exerciseId: "ex-ext", order: 2, prescribedSets: [S(1, 15, { restSeconds: 60 }), S(2, 15, { restSeconds: 60 })] }] },
      { id: "ps-jonas-2", name: "Lower", order: 1, exercises: [{ id: uuid(), exerciseId: "ex-squat", order: 0, prescribedSets: [S(1, 6, { type: "warm_up", restSeconds: 90 }), S(2, 8, { targetRpe: 8, restSeconds: 150 }), S(3, 8, { targetRpe: 8, restSeconds: 150 })] }, { id: uuid(), exerciseId: "ex-rdl", order: 1, prescribedSets: [S(1, 10, { targetRpe: 7, restSeconds: 120 }), S(2, 10, { targetRpe: 7, restSeconds: 120 })] }] },
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
    type: "warm_up" | "working" | "backoff";
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
    { exerciseId: "ex-squat", setNumber: 1, type: "warm_up", weightKg: 40, reps: 5 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 50, reps: 5, rpe: 7 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 50, reps: 5, rpe: 8 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(35), perceivedEnergy: 8, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "warm_up", weightKg: 45, reps: 5 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 52.5, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 52.5, reps: 4, rpe: 9 },
    { exerciseId: "ex-landmine", setNumber: 1, type: "working", weightKg: 30, reps: 8, rpe: 7 },
  ]},
  { sessionLogId: uuid(), clientId: "cl-maya", programId: "pg-maya-a", date: day(28), perceivedEnergy: 6, sets: [
    { exerciseId: "ex-squat", setNumber: 1, type: "warm_up", weightKg: 45, reps: 5 },
    { exerciseId: "ex-squat", setNumber: 2, type: "working", weightKg: 55, reps: 5, rpe: 8 },
    { exerciseId: "ex-squat", setNumber: 3, type: "working", weightKg: 55, reps: 5, rpe: 8 },
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
